/*!
 * contracts/escrow/src/lib.rs
 *
 * PayFi Escrow Contract — Soroban (Stellar)
 *
 * Lifecycle:
 *   1. `initialize`  — depositor locks funds, sets arbiter + recipient + expiry
 *   2. `release`     — arbiter releases funds to recipient
 *   3. `refund`      — depositor reclaims after expiry
 *
 * Security invariants:
 *   - Only the arbiter can call `release`
 *   - Only the depositor can call `refund`, and only after expiry
 *   - State transitions are enforced (no double-release / double-refund)
 */

#![cfg_attr(not(test), no_std)]
#![allow(unexpected_cfgs)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error,
    token::Client as TokenClient, Address, Env, Symbol,
};

// ─── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Depositor,
    Recipient,
    Arbiter,
    Token,
    Amount,
    Expiry,
    Released,
}

// ─── Contract States ──────────────────────────────────────────────────────────

/// Represents the lifecycle states of the escrow contract.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EscrowState {
    /// State before the escrow is initialized (no fields set).
    Uninitialized = 0,
    /// Active state after initialization, prior to release or refund.
    Active = 1,
    /// Final settled state after funds are either released or refunded.
    Settled = 2,
}

// ─── Contract Errors ──────────────────────────────────────────────────────────

/// Errors that can be returned by the escrow contract.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum EscrowError {
    /// The escrow contract is already initialised.
    AlreadyInitialized = 1,
    /// The transfer amount must be positive.
    AmountNotPositive = 2,
    /// The expiry timestamp must be in the future.
    ExpiryNotInFuture = 3,
    /// The caller is not the authorized arbiter.
    NotArbiter = 4,
    /// The caller is not the authorized depositor.
    NotDepositor = 5,
    /// The escrow has not yet expired.
    NotExpired = 6,
    /// The funds have already been released or refunded.
    AlreadySettled = 7,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialise the escrow and transfer funds from depositor to contract.
    ///
    /// # Arguments
    /// * `env`       - The execution environment.
    /// * `depositor` - Party locking the funds.
    /// * `recipient` - Party who receives funds on release.
    /// * `arbiter`   - Trusted party who authorises release.
    /// * `token`     - SAC token contract address.
    /// * `amount`    - Token amount (stroop-equivalent units).
    /// * `expiry`    - Unix timestamp after which depositor may refund.
    ///
    /// # Panics
    /// * `AlreadyInitialized` - If the escrow has already been initialised.
    /// * `AmountNotPositive` - If amount is not positive.
    /// * `ExpiryNotInFuture` - If expiry is not in the future.
    ///
    /// # Return Value
    /// None.
    pub fn initialize(
        env: Env,
        depositor: Address,
        recipient: Address,
        arbiter: Address,
        token: Address,
        amount: i128,
        expiry: u64,
    ) {
        // Prevent re-initialisation
        if env.storage().instance().has(&DataKey::Depositor) {
            panic_with_error!(&env, EscrowError::AlreadyInitialized);
        }

        depositor.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, EscrowError::AmountNotPositive);
        }
        if expiry <= env.ledger().timestamp() {
            panic_with_error!(&env, EscrowError::ExpiryNotInFuture);
        }

        // Pull funds from depositor
        TokenClient::new(&env, &token).transfer(
            &depositor,
            &env.current_contract_address(),
            &amount,
        );

        // Persist state
        env.storage()
            .instance()
            .set(&DataKey::Depositor, &depositor);
        env.storage()
            .instance()
            .set(&DataKey::Recipient, &recipient);
        env.storage().instance().set(&DataKey::Arbiter, &arbiter);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Amount, &amount);
        env.storage().instance().set(&DataKey::Expiry, &expiry);
        env.storage().instance().set(&DataKey::Released, &false);

        env.events().publish(
            (Symbol::new(&env, "initialized"),),
            (depositor, recipient, amount),
        );
    }

    /// Release funds to the recipient. Only callable by the arbiter.
    ///
    /// # Arguments
    /// * `env`     - The execution environment.
    /// * `arbiter` - Trusted party who authorises release.
    ///
    /// # Panics
    /// * `NotArbiter` - If caller is not the stored arbiter.
    /// * `AlreadySettled` - If funds have already been released or refunded.
    ///
    /// # Return Value
    /// None.
    pub fn release(env: Env, arbiter: Address) {
        arbiter.require_auth();

        let stored_arbiter: Address = env.storage().instance().get(&DataKey::Arbiter).unwrap();
        if arbiter != stored_arbiter {
            panic_with_error!(&env, EscrowError::NotArbiter);
        }

        Self::assert_not_released(&env);

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let amount: i128 = env.storage().instance().get(&DataKey::Amount).unwrap();
        let recipient: Address = env.storage().instance().get(&DataKey::Recipient).unwrap();

        env.storage().instance().set(&DataKey::Released, &true);

        TokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &recipient,
            &amount,
        );

        env.events()
            .publish((Symbol::new(&env, "released"),), (recipient, amount));
    }

    /// Refund depositor after expiry. Only callable by depositor.
    ///
    /// # Arguments
    /// * `env`       - The execution environment.
    /// * `depositor` - Party locking the funds.
    ///
    /// # Panics
    /// * `NotDepositor` - If caller is not the stored depositor.
    /// * `AlreadySettled` - If funds have already been released or refunded.
    /// * `NotExpired` - If contract is not yet expired.
    ///
    /// # Return Value
    /// None.
    pub fn refund(env: Env, depositor: Address) {
        depositor.require_auth();

        let stored_depositor: Address = env.storage().instance().get(&DataKey::Depositor).unwrap();
        if depositor != stored_depositor {
            panic_with_error!(&env, EscrowError::NotDepositor);
        }

        Self::assert_not_released(&env);

        let expiry: u64 = env.storage().instance().get(&DataKey::Expiry).unwrap();
        if env.ledger().timestamp() < expiry {
            panic_with_error!(&env, EscrowError::NotExpired);
        }

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let amount: i128 = env.storage().instance().get(&DataKey::Amount).unwrap();

        env.storage().instance().set(&DataKey::Released, &true);

        TokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &depositor,
            &amount,
        );

        env.events()
            .publish((Symbol::new(&env, "refunded"),), (depositor, amount));
    }

    /// Get the current lifecycle state of the escrow.
    ///
    /// # Arguments
    /// * `env` - The execution environment.
    ///
    /// # Panics
    /// This function does not panic.
    ///
    /// # Return Value
    /// Returns the current `EscrowState` (Uninitialized, Active, or Settled).
    pub fn get_state(env: Env) -> EscrowState {
        if !env.storage().instance().has(&DataKey::Depositor) {
            EscrowState::Uninitialized
        } else {
            let released: bool = env
                .storage()
                .instance()
                .get(&DataKey::Released)
                .unwrap_or(false);
            if released {
                EscrowState::Settled
            } else {
                EscrowState::Active
            }
        }
    }

    // ─── Internal helpers ────────────────────────────────────────────────────

    /// Assert that the escrow funds have not yet been released or refunded.
    ///
    /// # Arguments
    /// * `env` - The execution environment.
    ///
    /// # Panics
    /// * `AlreadySettled` - If the funds have already been released or refunded.
    ///
    /// # Return Value
    /// None.
    fn assert_not_released(env: &Env) {
        let released: bool = env
            .storage()
            .instance()
            .get(&DataKey::Released)
            .unwrap_or(false);
        if released {
            panic_with_error!(env, EscrowError::AlreadySettled);
        }
    }
}

#[cfg(test)]
mod test;
