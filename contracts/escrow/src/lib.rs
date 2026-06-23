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
    contract, contractimpl, contracttype, token::Client as TokenClient, Address, Env, Symbol,
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

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialise the escrow and transfer funds from depositor to contract.
    ///
    /// # Arguments
    /// * `depositor` — party locking the funds
    /// * `recipient` — party who receives funds on release
    /// * `arbiter`   — trusted party who authorises release
    /// * `token`     — SAC token contract address
    /// * `amount`    — token amount (stroop-equivalent units)
    /// * `expiry`    — Unix timestamp after which depositor may refund
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
            panic!("escrow: already initialised");
        }

        depositor.require_auth();

        assert!(amount > 0, "escrow: amount must be positive");
        assert!(
            expiry > env.ledger().timestamp(),
            "escrow: expiry must be in the future"
        );

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
    pub fn release(env: Env, arbiter: Address) {
        arbiter.require_auth();

        let stored_arbiter: Address = env.storage().instance().get(&DataKey::Arbiter).unwrap();
        assert!(
            arbiter == stored_arbiter,
            "escrow: caller is not the arbiter"
        );

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
    pub fn refund(env: Env, depositor: Address) {
        depositor.require_auth();

        let stored_depositor: Address = env.storage().instance().get(&DataKey::Depositor).unwrap();
        assert!(
            depositor == stored_depositor,
            "escrow: caller is not the depositor"
        );

        Self::assert_not_released(&env);

        let expiry: u64 = env.storage().instance().get(&DataKey::Expiry).unwrap();
        assert!(
            env.ledger().timestamp() >= expiry,
            "escrow: not yet expired"
        );

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

    // ─── Internal helpers ────────────────────────────────────────────────────

    fn assert_not_released(env: &Env) {
        let released: bool = env
            .storage()
            .instance()
            .get(&DataKey::Released)
            .unwrap_or(false);
        assert!(!released, "escrow: funds already released or refunded");
    }
}

#[cfg(test)]
mod test;
