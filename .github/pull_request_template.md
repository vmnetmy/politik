## Outcome

Describe the user-visible or data-governance outcome.

## Scope

- [ ] Application code
- [ ] Election or affiliation data
- [ ] PDF-derived seating coordinates
- [ ] Design system or visual change
- [ ] Deployment, security or telemetry

## Evidence

- Source URL or repository source file:
- Effective date, when applicable:
- Seats or candidates affected:

## Required checks

- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run test:python`
- [ ] `npm run data:seating:check`
- [ ] `npm run data:manifest:check`
- [ ] `npm run build`
- [ ] Responsive browser and Lighthouse checks reviewed

## Publishing approval

- [ ] Historical PRU-15 identity remains unchanged unless this is an evidenced source correction
- [ ] Post-election changes use effective-dated records
- [ ] Data integrity manifest was regenerated after published JSON changes
- [ ] Asset rights and source provenance are recorded
