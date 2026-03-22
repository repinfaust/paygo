# PAYGO Mobile (Expo iOS-first)

## Setup
1. Install dependencies:
   - `npm install`
2. Generate local Firebase env from your iOS plist:
   - `npm run firebase:env`

`mobile/.env.local` is ignored by git.

## Run
- `npm run ios`

Use Expo Development Build for native behaviour verification.

## Seed data import
1. Ensure `seed/payg_seed_data_v4.xlsx` exists in repo root.
2. Ensure anonymous auth + Firestore write rules permit seeded writes for your current auth profile.
3. Run:
   - `npm run seed:import`

The importer writes:
- `config/regions`
- `config/segments`
- `customers/{customerId}`
- `usage/{customerId}/daily/{docId}`
- `payments/{customerId}/history/{payId}`
- `rates/default`
