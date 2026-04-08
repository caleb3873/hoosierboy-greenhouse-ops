# Shipping Manager Module — Design Spec

**Date:** 2026-04-08
**Owner:** Tyler (Shipping Manager)
**Stakeholders:** Paul (ops), sales reps (Caleb, Mario, Trish, Rachel), drivers, shippers

## Goal

Tighten the communication loop between sales → Tyler → drivers/shippers so scheduling, route
ordering, claims, and fuel tracking all live in one place and Tyler has clear, mobile-first
visibility into the day's deliveries.

## Personas & access

| Role            | Login                                         | Device              |
|-----------------|-----------------------------------------------|---------------------|
| Sales rep       | Supabase email/password (existing admin role) | Desktop-first       |
| Tyler           | Supabase email/password (new shipping role)   | Mobile + desktop    |
| Shipping mgr    | Floor code (Sam, Evie, Ryan, Zach)            | Mobile              |
| Driver          | Floor code (pending — added by Tyler)         | Mobile              |

Sales rep passwords: `Hoosierboy1972!` (must be changed on first login — to be wired into login flow).

Shipping manager floor codes (already provisioned):
- `1234567` Sam Schroder
- `7654321` Evie Seaman
- `9876543` Ryan Griffith
- `8765432` Zach Stenz (shipping role) — **note**: Zack Stenz also has code `2222222` as a grower; confirm whether this is the same person in two roles.

## Data model

New tables in Supabase:

**shipping_customers** (seeded from `customer list.xls`, 718 rows)
- company_name, customer_type, care_of, address1, city, state, zip, phone, email, terms
- lat, lng, geocoded_at — populated lazily when a customer is first used in a delivery

**drivers**
- name, phone, license, notes, active (managed by Tyler)

**trucks**
- name/number, license_plate, riverlink_tag, capacity_notes, active

**shippers**
- name, phone, active

**deliveries**
- customer_id, delivery_date, priority (`critical|high|normal|flex`)
- driver_id, truck_id, stop_order (within driver/day)
- order_value_cents, notes
- miles, drive_minutes (from Google Distance Matrix, cached)
- status (`draft|scheduled|loading|in_transit|delivered|cancelled`)
- created_by (sales rep email), assigned_by (Tyler), confirmed_at
- left_at, delivered_at (for cycle-time tracking)
- email_sent_at (departure email)

**delivery_orders** (n per delivery)
- delivery_id, order_number (SBI ref), notes

**claims**
- delivery_id, type (`missing|wrong_color|damaged|short_count|wrong_plant|other`)
- notes, photos (jsonb array of base64 or storage urls)
- reported_by, reported_at
- resolved, resolved_at, resolution_notes, resolved_by

**fuel_fills**
- fill_date, gallons, total_cost_cents, price_per_gallon_cents
- supplier (`Browns Oil Service` default)
- entered_by, truck_id (optional)

**driver_attendance** (daily roster Tyler toggles)
- date, driver_id, present (bool), notes

## Key flows

### Sales rep — create delivery
1. Search `shipping_customers` autocomplete (company name, city, sales person filter)
2. Pick delivery date + priority + order value
3. Add one or more SBI order numbers
4. Notes
5. Save → `status=draft`, lands in Tyler's **Incoming** queue

### Tyler's dashboard (mobile + desktop)
- **Today** — board grouped by driver lanes (assigned) + unassigned column
- **Driver roster strip** — chips for each driver with a phone icon (tap to call) and a toggle for "present today"
- **Claims inbox** — badge count of unresolved claims
- **Upcoming days** — next 7 days preview
- **Fuel** — quick entry form (Browns Oil Service default)
- Drag / tap to assign a delivery → driver; reorder stops
- Route recalc: when Tyler saves assignments, call Google Distance Matrix from 4425 Bluff Rd → first stop → ... → last stop; cache miles and minutes on each delivery
- Cost overlay: running fleet cost-per-mile × miles = fuel cost per delivery

### Driver — mobile
- Floor-code login → list of stops for today, in Tyler's chosen order
- Each stop card: customer name, address, "Open in Google Maps" button (deeplink), phone-call button, items summary / order #s, **C.O.D. alert** if `terms` contains COD, customer quirks (pulled from SBI customer notes), total value
- Buttons: **Leave** (fires departure email + stamps left_at), **Arrive**, **Delivered** (stamps delivered_at), **Report Claim**
- Claim form: type dropdown, photo, notes → saved to `claims`

### Shipper — mobile (floor code)
- Loading queue for the day (unassigned until Tyler picks a driver)
- Mark loaded, flag short

### Claims resolution
- Land in Tyler's inbox
- Tap to view photos, customer, delivery
- Mark resolved with notes → sales rep who created the delivery is also notified

## Integrations

**Google Maps** — Geocoding API + Distance Matrix API
- Geocode `address1, city, state, zip` lazily on first use; cache on `shipping_customers.lat/lng`
- Distance Matrix from greenhouse (4425 Bluff Rd, Indianapolis, IN 46151) to delivery for miles/minutes
- **Need**: API key (user mentioned hoosierboy.com already has one — confirm)
- Add `REACT_APP_GOOGLE_MAPS_API_KEY` to `.env.local` and Vercel env

**Resend** — departure emails
- Template: "Your order from Schlegel Greenhouse is on its way. You are stop #N today. ETA ~X."
- Triggered by driver tapping "Leave"
- Uses existing Resend setup from fundraiser app

## Fuel cost math

Running average cost per gallon = Σ(total_cost) / Σ(gallons) across fuel_fills
Assumed fleet mpg (configurable constant, default 8 mpg for loaded trucks)
Fuel cost per delivery = miles / mpg × cost_per_gallon
Tyler can override mpg in the trucks table per vehicle.

## Priority labels

- **Critical** — can't slip, schedule disruption if missed
- **High** — important, prioritize routing
- **Normal** — standard
- **Flex** — date window, load when room allows

## Claim types

Missing / Wrong color / Damaged / Short count / Wrong plant / Other

## Open questions

1. **Google Maps API key** — reuse from hoosierboy.com project? Need the key itself.
2. **Zack Stenz** — same person with two codes, or different Zach? (Current spec assumes one person, two roles.)
3. **Drivers list** — deferred, Tyler will add via UI once built.
4. **Sales rep passwords** — force password reset on first login?
5. **SBI** — manual order number only for v1, no integration.

## Build slices (implementation order)

1. **Customers browser** — sales rep & Tyler can search the 718 imported customers
2. **Drivers / trucks admin** — CRUD on drivers, trucks, shippers
3. **Sales rep create-delivery flow** — pick customer, date, priority, order #s, notes, value
4. **Tyler's dashboard v1** — today board + assign flow + driver attendance
5. **Google Maps geocoding + distance matrix** — miles/minutes on deliveries
6. **Driver mobile view** — stop list, Leave/Arrive/Delivered, Maps deeplink
7. **Claims** — report + inbox + resolve
8. **Fuel tracking** — log fills, cost-per-mile overlay
9. **Departure emails** — Resend integration
10. **Shipper mobile view** — loading queue
