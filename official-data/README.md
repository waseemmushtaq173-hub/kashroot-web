# Official documents for TrueScan

This folder is where the Government's and the university's own documents are kept, **exactly as
published**, so every list on KashRoot can be traced to a file. KashRoot never types a registration,
a dose or a ban into the app: a product reaches TrueScan only from a document kept here (or from the
official file a list is linked to in Admin → Official lists).

## Which documents

| Put here | Published by | Where | Note found in Nov 2026 |
| --- | --- | --- | --- |
| Registered pesticides, section 9(3) and 9(4) | CIB&RC, Directorate of Plant Protection, Quarantine & Storage | https://ppqs.gov.in/divisions/cib-rc/registered-products | PDF lists "as on 31.03.2024". Later approvals are only in the Registration Committee minutes. |
| Banned / restricted / refused pesticides | DPPQS (Ministry of Agriculture) | same site; changes in the Gazette | "As on 31.03.2024". A paraquat ban was reported as a draft in July 2026: check the Gazette for the final order. |
| Fertiliser (Control) Order, 1985: Schedule I standards and every amendment | Ministry of Agriculture and Farmers Welfare | https://egazette.gov.in | Amendment numbering differs between secondary sources: take the text from the Gazette. |
| FCO Schedule VI: approved biostimulants (146 products) | Ministry of Agriculture and Farmers Welfare | Gazette / Department of Agriculture notifications | Provisional registrations ended on 16 June 2025. |
| Yearly apple spray schedule | SKUAST-K Directorate of Research; notified by the Director Horticulture, Kashmir | https://horticulture.jk.gov.in, https://www.skuastkashmir.ac.in | No 2026 file was found online: ask the Directorate or the district Horticulture Development Officer. |
| Fertiliser doses per tree by age | J&K Department of Horticulture / SKUAST-K package of practices | https://horticulture.jk.gov.in/FAQs.html | Check against the current schedule before use. |

`data.gov.in` is **not** a source for these: it holds production, import and consumption statistics,
not a register of products. Its key (`DATA_GOV_IN_API_KEY`) is for Agmarknet mandi prices.

## How to add a document

1. Download it from the publisher (not from a news site or a copy) and keep it unchanged.
2. Name it `<publisher>-<what>-as-on-<YYYY-MM-DD>.<ext>`, for example
   `cibrc-registered-9-3-as-on-2024-03-31.pdf`.
3. Commit it here. Then, either
   - save the list as CSV and import it in **Admin → Official lists**, naming it after the document and its
     "as on" date and linking the page it came from; or
   - if it is a PDF, ask for a PDF importer: its table layout has to be read from the real file first.
4. When the publisher posts a newer document, add it next to the old one and import it again; a newer copy
   replaces the older list. A list with a CSV link is re-read every day by itself.

TrueScan shows each answer with the list's name, link and "as on" date. Where a list is older than the
products now on sale (as the March 2024 register is), its name says so.

## The CIB&RC lists in TrueScan (`cibrc/`)

The five lists the CIB&RC publishes at https://ppqs.gov.in/divisions/cib-rc/registered-products are kept here **unchanged**,
and `scripts/extract-cibrc-lists.py` reads them row for row into `src/data/cibrc-official.json` (the lists) and
`src/data/cibrc-official-meta.json` (counts and the "as on" date printed on each). TrueScan shows nothing else for
pesticides: no entry is typed in by KashRoot.

| File | Holds | As on |
| --- | --- | --- |
| `list_of_pesticides_as_on_31.03.2026.pdf` | 371 active ingredients registered under section 9(3) | 31.03.2026 |
| `list_pf_pesticide_formulations_registered_as_on_31.03.2026.pdf` | 1,160 registered formulations (insecticides, fungicides, herbicides, plant growth regulators, nematicides, bio-pesticides) | 31.03.2026 |
| `list_of_pesticides_which_are_banned_refused_registration_and_restricted_in_use_31.10.26.pdf` | 50 banned, 5 banned for use but made for export, 8 withdrawn, 18 refused registration, 16 restricted in use (with the restriction and its notification) | 31.10.2026 |
| `7._formulation_approved_for_public_health_household_and_rodenticideUpdated_31.07.2026.pdf` | 133 household, public health and rodent-control formulations | 31.7.2026 |
| `approved_pesticides_for_desert_locust_control.pdf` | 15 pesticides approved for desert locust control, with doses | (no date printed) |

The Government's PDFs skip some serial numbers (277 in the ingredients list; 17 in the formulations list). That is
in the PDFs themselves and is recorded in the JSON (`numbers_not_printed`); nothing is filled in.

**To update when the CIB&RC posts newer lists:** save the new PDFs from the page above into a folder, then run
`python3 scripts/update-cibrc-lists.py --from <that folder>` (it copies only real PDFs with a newer date in their name) and
`python3 scripts/extract-cibrc-lists.py` (it reads the newest file of each list, checks its own counts and that the date
printed inside each PDF is the date in its name, and stops if anything does not add up). Commit the PDFs and the two JSON
files. The CIB&RC site answers GitHub's servers with HTTP 403 (checked on 16 Nov 2026), so this cannot be fetched
automatically from GitHub; the lists name chemicals and formulations, not brands or registration numbers, and TrueScan
says so under every answer.