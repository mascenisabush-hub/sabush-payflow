# Sabush System ERP Security Specification

## Data Invariants
1. A **User** must have a valid `uid`, `email`, and `role`.
2. A **Business** must have an `ownerId` that matches the creator's `uid`.
3. **Customers**, **Products**, and **Invoices** MUST belong to a `businessId`.
4. A user can only access data if their `businessId` matches the document's `businessId`.
5. Staff roles have restricted access (e.g., cannot delete invoices or edit business settings, but can create/read).
6. Owners have full access to their business data.

## The Dirty Dozen Payloads (Rejection Targets)
1. **Identity Spoofing**: Attempt to create a user profile with a different `uid` than the authenticated user.
2. **Business Hijacking**: Attempt to create a business with an `ownerId` that isn't the current user.
3. **Cross-Tenant Access**: User A from Business A tries to read an invoice from Business B.
4. **Privilege Escalation**: A "staff" user tries to update their role to "owner" or "super_admin".
5. **Orphaned Record**: Create an invoice for a `businessId` that doesn't exist.
6. **Immutable Field Tampering**: Attempt to change `createdAt` on an existing invoice.
7. **Value Poisoning**: Sending a 2MB string as a product name.
8. **Invalid Status Transition**: Changing an invoice status from "paid" back to "draft" (locked state).
9. **Identity Integrity Bypass**: Creating a customer record where `businessId` is someone else's business.
10. **Shadow Field Injection**: Adding `isVerified: true` to a user profile where the schema doesn't allow it.
11. **PII Leakage**: A guest or unrelated user attempting to list the `/users` collection.
12. **System Field Edits**: Attempting to mock `updatedAt` instead of using server timestamp.

## Red Team Evaluation Plan
We will use `firestore.rules.test.ts` (simulated logic) to verify these constraints.
