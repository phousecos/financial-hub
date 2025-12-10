# Financial Hub - Complete 10-Day Roadmap

## Overview
Build a complete multi-company financial management system with receipt matching, Amex import, and QuickBooks Desktop integration.

**Total Time:** 8-10 full development days
**Deploy:** Vercel + GitHub
**Stack:** Next.js, TypeScript, Supabase, Cloudflare Workers, QB Web Connector

---

## Phase 1: Foundation (Days 1-2)
**Goal:** Database, receipt ingestion, basic UI

### Day 1 - Database & Core Setup ✅ YOU ARE HERE
**Time:** 4-6 hours

**Morning (2-3 hours):**
- [ ] Create Supabase project
- [ ] Run schema migration (7 tables)
- [ ] Set up storage bucket
- [ ] Seed companies data

**Afternoon (2-3 hours):**
- [ ] Create Next.js project
- [ ] Install dependencies
- [ ] Copy starter files
- [ ] Build companies management page
- [ ] Build dashboard with stats
- [ ] Test locally

**Evening (optional):**
- [ ] Deploy to Vercel
- [ ] Set up GitHub repo

**Deliverables:**
✅ Working dashboard
✅ All companies added
✅ Live on Vercel

---

### Day 2 - Receipt Ingestion
**Time:** 4-6 hours

**Tasks:**
- [ ] Set up Cloudflare Email Worker
- [ ] Configure email routing
- [ ] Build email parsing logic
- [ ] Handle attachments → Supabase Storage
- [ ] Create receipt list page
- [ ] Build receipt detail view
- [ ] Test: Send receipt email → View in app

**Deliverables:**
✅ Email → Supabase pipeline working
✅ Can view all receipts
✅ Can see receipt images/PDFs

---

## Phase 2: Transaction Management (Days 3-4)

### Day 3 - Amex Import
**Time:** 3-5 hours

**Morning:**
- [ ] Build CSV upload interface
- [ ] Implement Amex CSV parser
- [ ] Handle company selection
- [ ] Transaction creation with deduplication
- [ ] Validation & error handling

**Afternoon:**
- [ ] Transaction list view
- [ ] Filters (company, date range, unmatched)
- [ ] Search functionality
- [ ] Test with your actual Amex CSV

**Deliverables:**
✅ Can upload Amex CSV
✅ Transactions appear in database
✅ Can filter and search

---

### Day 4 - Smart Matching (Part 1)
**Time:** 4-5 hours

**Tasks:**
- [ ] Build matching algorithm
  - Amount match (±$5 threshold)
  - Date match (±3 days)
  - Confidence scoring
- [ ] Suggested matches API endpoint
- [ ] Basic matching UI layout
- [ ] Display unmatched receipts
- [ ] Display unmatched transactions

**Deliverables:**
✅ Algorithm suggests matches
✅ Can see matches in UI

---

## Phase 3: Matching Interface (Days 4-5)

### Day 5 - Smart Matching (Part 2)
**Time:** 4-5 hours

**Tasks:**
- [ ] Drag-and-drop matching UI
- [ ] Click-to-match alternative
- [ ] Handle transaction splits (1 receipt → many txns)
- [ ] Unmatch capability
- [ ] Bulk actions
- [ ] Match confirmation/audit trail

**Deliverables:**
✅ Complete matching workflow
✅ Can match receipts to transactions
✅ Can handle splits
✅ Audit trail of matches

---

## Phase 4: QuickBooks Integration (Days 6-8)
**Goal:** Bidirectional sync with QB Desktop Enterprise

### Day 6 - QB Web Connector Service ✅ COMPLETED
**Time:** 6-8 hours (Most complex day)

**Morning (3-4 hours):**
- [x] Set up QBXML library (`lib/qbxml/`)
- [x] Create SOAP service endpoint (`/api/qbwc`)
- [x] Implement Web Connector handshake
- [x] Generate WSDL for Web Connector

**Afternoon (3-4 hours):**
- [x] Build session management (`lib/qbwc/session-manager.ts`)
- [x] Create QWC file generator (`/api/sync/qwc`)
- [x] Multi-company username mapping (sync-{code})
- [x] Test connection with QB Enterprise

**Deliverables:**
✅ Web Connector connects to QB
✅ QWC files downloadable per company
✅ Multi-company authentication working

---

### Day 7 - Pull from QB ✅ COMPLETED
**Time:** 4-6 hours

**Tasks:**
- [x] Build QBXML query builders (vendors, customers, accounts, transactions)
- [x] Build QBXML response parsers
- [x] Pull transactions from QB (checks, bills, credit card charges)
- [x] Parse QB responses → Supabase schema
- [x] Duplicate detection with confidence scoring
- [x] Sync logging to `sync_log` table

**Deliverables:**
✅ Can pull transactions from QB
✅ Transactions appear in database with `source: 'qb_pull'`
✅ Duplicates detected and handled

---

### Day 8 - Push to QB & UI ✅ COMPLETED
**Time:** 6-8 hours

**Completed:**
- [x] Sync dashboard UI (`/sync` page)
- [x] Company selector with QB configuration
- [x] Sync trigger buttons (Full, Transactions, Vendors, Accounts)
- [x] Sync status display with progress
- [x] Recent sync logs display
- [x] QWC download with setup instructions
- [x] Build transaction creation QBXML (push new transactions to QB)
- [x] Push transactions to QB (Checks, Bills, Credit Card Charges)
- [x] Add receipt links to QB memo field
- [x] Update local transaction with QB TxnID after successful push

**Deliverables:**
✅ Complete sync UI
✅ Full bidirectional sync (pull and push)

---

## Phase 5: Polish & Testing (Days 9-10)

### Day 9 - Admin Features & Reporting
**Time:** 3-5 hours

**Morning (2-3 hours):**
- [ ] Company management improvements
- [ ] Bank account configuration
- [ ] User roles (admin vs bookkeeper)
- [ ] Sync triggers & controls
- [ ] Status dashboard

**Afternoon (2 hours):**
- [ ] Unmatched receipts report
- [ ] Unmatched transactions report
- [ ] Receipt coverage by company
- [ ] Sync history log
- [ ] Export capabilities

**Deliverables:**
✅ Complete admin interface
✅ All reports working
✅ Ready for bookkeeper

---

### Day 10 - Testing & Documentation
**Time:** 4-6 hours

**Morning (2-3 hours):**
- [ ] End-to-end testing
  - Email receipt → match → QB sync
  - Amex import → match → QB sync
  - Multi-company scenarios
  - Error scenarios
- [ ] Performance testing (bulk imports)
- [ ] Fix any bugs found

**Afternoon (2-3 hours):**
- [ ] User documentation
- [ ] Bookkeeper onboarding guide
- [ ] QB Web Connector setup instructions
- [ ] Troubleshooting guide
- [ ] Final deployment

**Deliverables:**
✅ System fully tested
✅ Documentation complete
✅ Ready for production use

---

## Success Metrics

### By Day 5 (Without QB):
- All receipts stored and searchable
- Amex transactions imported
- Smart matching working
- Audit trail complete

### By Day 10 (Full System):
- Bidirectional QB sync
- All companies integrated
- Bookkeeper can use independently
- Ready for year-end audit

---

## Technical Architecture

```
┌─────────────────────────────────────────────┐
│  CLOUD (Vercel + Supabase)                  │
│                                             │
│  ┌──────────────┐      ┌──────────────┐    │
│  │  Next.js App │◄────►│  Supabase    │    │
│  │              │      │  - Postgres  │    │
│  │  - Dashboard │      │  - Storage   │    │
│  │  - Matching  │      │  - RLS       │    │
│  │  - Reports   │      │              │    │
│  └──────────────┘      └──────────────┘    │
│         ▲                                   │
│         │                                   │
│  ┌──────┴──────┐                            │
│  │ Cloudflare  │                            │
│  │ Email Worker│                            │
│  └─────────────┘                            │
└─────────────────────────────────────────────┘
          │
          │ API calls
          │
┌─────────┼───────────────────────────────────┐
│  WINDOWS LAPTOP (QB Integration only)       │
│         ▼                                   │
│  ┌──────────────┐      ┌──────────────┐    │
│  │ QB Web       │◄────►│ QuickBooks   │    │
│  │ Connector    │      │ Desktop      │    │
│  │ (Node.js)    │      │ Enterprise   │    │
│  └──────────────┘      └──────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Daily Time Estimates

| Day | Focus Area | Hours | Complexity |
|-----|------------|-------|------------|
| 1 | Database & Setup | 4-6 | Low |
| 2 | Receipt Ingestion | 4-6 | Medium |
| 3 | Amex Import | 3-5 | Low |
| 4 | Matching Algorithm | 4-5 | Medium |
| 5 | Matching UI | 4-5 | Medium |
| 6 | QB Connector | 6-8 | **HIGH** |
| 7 | QB Pull | 4-6 | High |
| 8 | QB Push | 6-8 | **HIGH** |
| 9 | Admin & Reports | 3-5 | Low |
| 10 | Testing & Docs | 4-6 | Medium |
| **Total** | | **42-60** | |

---

## Risk Areas & Mitigation

### High Risk: QB Web Connector (Days 6-8)
**Why:** QB Desktop has quirky XML API, Windows-only
**Mitigation:** 
- Budget extra time
- Test with single company first
- Keep QBXML requests simple
- Log everything for debugging

### Medium Risk: Receipt Email Parsing
**Why:** Email formats vary, attachments tricky
**Mitigation:**
- Start with simple format (first line only)
- Can iterate format later
- Manual fallback always available

### Low Risk: Everything Else
**Why:** Standard web dev, proven stack

---

## Cost Breakdown

### Development (Your Time)
- 8-10 days @ your consulting rate

### Ongoing Monthly Costs
- Supabase: $25/month (Pro plan)
- Vercel: $20/month (Pro plan) 
- Cloudflare: $5/month (Workers)
- **Total: ~$50/month**

### One-Time Costs
- Domain: $12/year (if needed)
- QB Desktop Enterprise: Already owned

**ROI:** If saves 15-20 hrs/month on bookkeeping = paid off in month 1

---

## Next Steps

**Right Now:**
1. Download `financial-hub-day1.zip`
2. Read `DAY1_SETUP.md` 
3. Follow `QUICK_START.md`
4. Complete Day 1 (2-3 hours)

**Tomorrow:**
Move to Day 2 - Cloudflare Email Worker

**Questions?** Ask before starting each phase!

🚀 **Let's build this!**
