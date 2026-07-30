# Repository Summary: keyword_research_agent

> Auto-maintained by Sim Development. Last updated: 2026-07-30T10:51:00.894Z.

## Overview

Keyword Research — expand a seed keyword into a validated, competitor-backed shortlist with live pipeline streaming, exports, and run history.

**Repository:** `keyword-research-agent`  
**File count:** 52

## Features

- Streaming keyword research pipeline wired to the updated Arena workflow API (new key + selectedOutputs contract including finalresponse.data)
- Lenient parsing of the new UUID-keyed workflow output (dedup, SEMrush rows, SERP fetch, URL scoring, composite scoring, alignment scores, validation pass, final response)
- Generator tab always starts empty — no restored data by default, and switching tabs clears all generator data
- Read-only history with copy-as-table and PDF export
- Saved runs persisted to Neon Postgres via Prisma

## Tech Stack

- Next.js ^15.3.3 (App Router)
- React ^19.0.0
- Tailwind CSS v3
- TypeScript
- Prisma + PostgreSQL (Neon on Vercel)

## Infrastructure

- **DATABASE_URL:** set on Vercel when Neon is connected — do not commit real credentials

## Routes & Pages

- `/` — `app/page.tsx`
- `/access-denied` — `app/access-denied/page.tsx`

## Database Models

- `ResearchRun`

## File Inventory

### App pages

- `app/access-denied/page.tsx`
- `app/arena-ds-tokens.css`
- `app/error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/page.tsx`

### API routes

- `app/api/keyword-research/history/route.ts`
- `app/api/keyword-research/init/route.ts`
- `app/api/keyword-research/stream/[token]/route.ts`
- `app/api/runs/route.ts`
- `app/api/semrush/balance/route.ts`

### Components

- `components/AlignmentScoresPanel.tsx`
- `components/CompetitorUrlsPanel.tsx`
- `components/CompositeScoringPanel.tsx`
- `components/DedupKeywordsPanel.tsx`
- `components/ErrorBoundary.tsx`
- `components/ErrorCard.tsx`
- `components/ExaResearchPanel.tsx`
- `components/HistoryDetail.tsx`
- `components/HistoryView.tsx`
- `components/KeywordResearchApp.tsx`
- `components/KeywordResearchClient.tsx`
- `components/PdfDownloadButton.tsx`
- `components/ProgressTracker.tsx`
- `components/QueryVariantsPanel.tsx`
- `components/ResearchForm.tsx`
- `components/ResultsSection.tsx`
- `components/SemrushBalanceWidget.tsx`
- `components/SemrushKeywordsPanel.tsx`
- `components/SerpResultsPanel.tsx`
- `components/SourceKeywordsPanel.tsx`
- `components/arena-email-provider.tsx`

### Libraries

- `lib/arena-email-constants.ts`
- `lib/arena-email.ts`
- `lib/copy-table.ts`
- `lib/format.ts`
- `lib/history.ts`
- `lib/pdf.ts`
- `lib/prisma.ts`
- `lib/types.ts`
- `prisma/schema.prisma`

### Config

- `.env.example`
- `middleware.ts`
- `next-env.d.ts`
- `next.config.ts`
- `package.json`
- `postcss.config.mjs`
- `tailwind.config.ts`
- `tsconfig.json`

### Other

- `README.md`
- `REPO_SUMMARY.md`

## Complete File Index

- `.env.example`
- `README.md`
- `REPO_SUMMARY.md`
- `app/access-denied/page.tsx`
- `app/api/keyword-research/history/route.ts`
- `app/api/keyword-research/init/route.ts`
- `app/api/keyword-research/stream/[token]/route.ts`
- `app/api/runs/route.ts`
- `app/api/semrush/balance/route.ts`
- `app/arena-ds-tokens.css`
- `app/error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/page.tsx`
- `components/AlignmentScoresPanel.tsx`
- `components/CompetitorUrlsPanel.tsx`
- `components/CompositeScoringPanel.tsx`
- `components/DedupKeywordsPanel.tsx`
- `components/ErrorBoundary.tsx`
- `components/ErrorCard.tsx`
- `components/ExaResearchPanel.tsx`
- `components/HistoryDetail.tsx`
- `components/HistoryView.tsx`
- `components/KeywordResearchApp.tsx`
- `components/KeywordResearchClient.tsx`
- `components/PdfDownloadButton.tsx`
- `components/ProgressTracker.tsx`
- `components/QueryVariantsPanel.tsx`
- `components/ResearchForm.tsx`
- `components/ResultsSection.tsx`
- `components/SemrushBalanceWidget.tsx`
- `components/SemrushKeywordsPanel.tsx`
- `components/SerpResultsPanel.tsx`
- `components/SourceKeywordsPanel.tsx`
- `components/arena-email-provider.tsx`
- `lib/arena-email-constants.ts`
- `lib/arena-email.ts`
- `lib/copy-table.ts`
- `lib/format.ts`
- `lib/history.ts`
- `lib/pdf.ts`
- `lib/prisma.ts`
- `lib/types.ts`
- `middleware.ts`
- `next-env.d.ts`
- `next.config.ts`
- `package.json`
- `postcss.config.mjs`
- `prisma/schema.prisma`
- `tailwind.config.ts`
- `tsconfig.json`

## Latest Change

- **Updated at:** 2026-07-30T10:51:00.894Z
- **Request:** Make the following changes only. Do not change any other styling, colors, spacing, copy, or layout beyond what's explicitly listed below.


Verify the API 
curl --location 'https://agent.thearena.ai/api/workflows/b056ebe3-2df8-4d6a-aa17-d90e6b5f3c7f/execute' \
--header 'X-API-Key: sk-sim-GwQAiLwWID8U3islZzPltwAgmjlUHY5v' \
--header 'Content-Type: application/json' \
--header 'Cookie: AWSALB=g6ZYeP0hcJIK/1yZrgKpGiYsPN3ZAD3KsnHf9qHP+TFS+7te4+yLbOZNOKkkvg+O4/eU+MNgrLpJDMC2HmJVMyY79MXSLRZWgj+GsdlmZC6g8Fgy+H8S3njHNg36; AWSALBCORS=g6ZYeP0hcJIK/1yZrgKpGiYsPN3ZAD3KsnHf9qHP+TFS+7te4+yLbOZNOKkkvg+O4/eU+MNgrLpJDMC2HmJVMyY79MXSLRZWgj+GsdlmZC6g8Fgy+H8S3njHNg36' \
--data-raw '{
    "keyword": "Dental Implants",
    "intent": "commercial",
    "email": "hanuvendra.pandey@position2.com",
    "stream": true,
    "selectedOutputs": [
        "dedup&volumenormalize.result",
        "aishortlisting.primary",
        "aishortlisting.secondary",
        "urlscoring&selection.result",
        "alignmentscoring.scores",
        "aggregatesemrushrows.result",
        "serpfetch.result",
        "compositescoring.result",
        "validationpass.primary",
        "validationpass.secondary",
        "validationpass.warning.type",
        "validationpass.warning.description",
        "finalresponse.data"
    ]
}'

Reesponse :

{
    "event": "final",
    "data": {
        "success": true,
        "output": {
            "ae02b4a1-d4e7-413e-952b-a2ba2f79d94c": {
                "result": {
                    "candidates": [
                        {
                            "keyword": "dental implants",
                            "volume": 450000,
                            "position": 99,
                            "cpc": 9.14,
                            "difficulty": 0,
                            "urlFrequency": 1,
                            "volumeScore": 1
                        },
                        {
                            "keyword": "dental implant",
                            "volume": 110000,
                            "position": 99,
                            "cpc": 9.14,
                            "difficulty": 0,
                            "urlFrequency": 1,
                            "volumeScore": 0.24
                        }
                    ],
                    "totalCandidates": 2
                }
            },
            "e39a3a58-4c46-4c71-b967-cd50690ce3b3": {
                "primary": [
                    {
                        "keyword": "dental implants",
                        "reasoning": "Best primary target because it exactly matches the seed topic and commercial intent while offering by far the highest search volume in the candidate set.",
                        "volume": 450000
                    }
                ],
                "secondary": [
                    {
                        "keyword": "dental implant",
                        "reasoning": "High-volume singular variant that supports broad relevance and captures users searching for the procedure in general.",
                        "volume": 110000
                    }
                ]
            },
            "fbd19a6a-4aaa-4714-948e-8c93379cc804": {
                "result": {
                    "selectedUrls": [
                        {
                            "url": "https://www.ncbi.nlm.nih.gov/books/NBK470448/",
                            "title": "Dental Implants - StatPearls - NCBI Bookshelf",
                            "snippet": "Dental Implants - StatPearls - NCBI Bookshelf\n\n# Bookshelf\n\nBookshelf home\n\nSearch databaseBooksAll DatabasesAssemblyBiocollectionsBioProjectBioSampleBooksClinVarConserved DomainsdbGaPdbVarGeneGenomeGEO DataSetsGEO ProfilesGTRIdentical Protein GroupsMedGenMeSHNLM CatalogNucleotideOMIMPMCProteinProte",
                            "position": 3,
                            "domain": "",
                            "scoreBreakdown": {
                                "positionScore": 80,
                                "typeScore": 90,
                                "overlapScore": 100,
                                "intentScore": 34
                            },
                            "score": 80.1
                        },
                        {
                            "url": "https://my.clevelandclinic.org/health/treatments/10903-dental-implants",
                            "title": "Dental Implants: Types, Purpose & Benefits",
                            "snippet": "Dental Implants: Types, Purpose & Benefits\n\nDental Implants\n\nAdvertisement\n\nAdvertisement\n\n# Dental Implants\n\nMedically Reviewed.Last updated on 06/11/2026.\n\nDental implants are a common surgical tooth replacement option. They provide support for artificial teeth like crowns, bridges and dentures. D",
                            "position": 2,
                            "domain": "",
                            "scoreBreakdown": {
                                "positionScore": 90,
                                "typeScore": 90,
                                "overlapScore": 100,
                                "intentScore": 0
                            },
                            "score": 78.5
                        }
                    ],
                    "urls": [
                        "https://www.ncbi.nlm.nih.gov/books/NBK470448/",
                        "https://my.clevelandclinic.org/health/treatments/10903-dental-implants"
                    ]
                }
            },
            "a1147e0b-f119-4e8b-951c-9d62113f735c": {
                "scores": [
                    {
                        "keyword": "dental implants",
                        "alignment": 10
                    }
                ]
            },
            "a570bc3b-137e-4880-b170-844707315c63": {
                "result": {
                    "rows": [
                        {
                            "Keyword": "what are dental implants",
                            "Search Volume": "60500",
                            "CPC": "4.41",
                            "_sourceUrl": "https://www.ncbi.nlm.nih.gov/books/NBK470448/"
                        }
                    ],
                    "totalRows": 60
                }
            },
            "de044561-cc86-4619-94de-5a262b443c43": {
                "result": {
                    "queries": [
                        "Dental Implants"
                    ],
                    "organic": [
                        {
                            "link": "https://www.mayoclinic.org/tests-procedures/dental-implant-surgery/about/pac-20384622",
                            "title": "Dental implant surgery",
                            "snippet": "Dental implant surgery - Mayo Clinic\n\nThis content does not have an English version.\n\nThis content does not have an Arabic version.\n\n## Overview\n\nDental implant surgery Enlarge image\n\nDental implant surgery replaces tooth roots with metal, screwlike posts and replaces damaged or missing teeth with a",
                            "position": 1,
                            "sourceQuery": "Dental Implants"
                        },
                        {
                            "link": "https://my.clevelandclinic.org/health/treatments/10903-dental-implants",
                            "title": "Dental Implants: Types, Purpose & Benefits",
                            "snippet": "Dental Implants: Types, Purpose & Benefits\n\nDental Implants\n\nAdvertisement\n\nAdvertisement\n\n# Dental Implants\n\nMedically Reviewed.Last updated on 06/11/2026.\n\nDental implants are a common surgical tooth replacement option. They provide support for artificial teeth like crowns, bridges and dentures. D",
                            "position": 2,
                            "sourceQuery": "Dental Implants"
                        },
                        {
                            "link": "https://www.ncbi.nlm.nih.gov/books/NBK470448/",
                            "title": "Dental Implants - StatPearls - NCBI Bookshelf",
                            "snippet": "Dental Implants - StatPearls - NCBI Bookshelf\n\n# Bookshelf\n\nBookshelf home\n\nSearch databaseBooksAll DatabasesAssemblyBiocollectionsBioProjectBioSampleBooksClinVarConserved DomainsdbGaPdbVarGeneGenomeGEO DataSetsGEO ProfilesGTRIdentical Protein GroupsMedGenMeSHNLM CatalogNucleotideOMIMPMCProteinProte",
                            "position": 3,
                            "sourceQuery": "Dental Implants"
                        }
                    ],
                    "searchResults": {
                        "organic": [
                            {
                                "link": "https://www.mayoclinic.org/tests-procedures/dental-implant-surgery/about/pac-20384622",
                                "title": "Dental implant surgery",
                                "snippet": "Dental implant surgery - Mayo Clinic\n\nThis content does not have an English version.\n\nThis content does not have an Arabic version.\n\n## Overview\n\nDental implant surgery Enlarge image\n\nDental implant surgery replaces tooth roots with metal, screwlike posts and replaces damaged or missing teeth with a",
                                "position": 1,
                                "sourceQuery": "Dental Implants"
                            }
                        ]
                    }
                }
            },
            "40ebb2fd-6ef1-4195-8883-fa9f96a82f3b": {
                "result": {
                    "candidates": [
                        {
                            "keyword": "dental implants",
                            "volume": 450000,
                            "position": 99,
                            "cpc": 9.14,
                            "difficulty": 0,
                            "urlFrequency": 1,
                            "volumeScore": 1,
                            "alignmentScore": 1,
                            "compositeScore": 1
                        }
                    ],
                    "totalCandidates": 52
                }
            },
            "6e43db93-8b1c-4e06-b7fa-e9b00212a34a": {
                "primary": [
                    {
                        "keyword": "dental implants",
                        "reasoning": "Best primary target because it exactly matches the seed topic and commercial intent while offering by far the highest search volume in the candidate set.",
                        "volume": 450000
                    },
                    {
                        "keyword": "full mouth dental implants",
                        "reasoning": "Strong commercial primary keyword with high volume and clear treatment-shopping intent for a major implant service category.",
                        "volume": 110000
                    }
                ],
                "secondary": [
                    {
                        "keyword": "dental implant",
                        "reasoning": "High-volume singular variant that supports broad relevance and captures users searching for the procedure in general.",
                        "volume": 110000
                    },
                    {
                        "keyword": "tooth implant",
                        "reasoning": "Strong supporting term with substantial volume and commercial intent from users considering a single-tooth replacement option.",
                        "volume": 74000
                    },
                    {
                        "keyword": "teeth implants",
                        "reasoning": "Useful high-volume variant that broadens coverage for users searching less formally for implant treatment.",
                        "volume": 60500
                    },
                    {
                        "keyword": "types of dental implants",
                        "reasoning": "Valuable supporting keyword for comparison-focused commercial research before choosing an implant solution.",
                        "volume": 60500
                    },
                    {
                        "keyword": "dental implants for missing teeth",
                        "reasoning": "Highly intent-aligned long-tail phrase that matches users looking for implants as a solution to missing teeth.",
                        "volume": 4400
                    },
                    {
                        "keyword": "dental implants dentist",
                        "reasoning": "Commercially strong supporting keyword because it signals users looking for a provider who offers dental implants.",
                        "volume": 8100
                    },
                    {
                        "keyword": "dental implant procedure",
                        "reasoning": "Good secondary term for users evaluating what treatment involves before booking or consulting a dentist.",
                        "volume": 8100
                    },
                    {
                        "keyword": "dental implant surgery",
                        "reasoning": "Relevant procedure-focused support keyword that captures users researching the surgical aspect of implant care.",
                        "volume": 3600
                    },
                    {
                        "keyword": "benefits of dental implants",
                        "reasoning": "Helpful supporting informational-commercial keyword for users weighing the value of implants before making a treatment decision.",
                        "volume": 2400
                    }
                ]
            },
            "93134d31-b818-4c29-b7e3-b0efa680736d": {
                "data": "{\n  \"primary\": [{\"keyword\":\"dental implants\",\"reasoning\":\"Best primary target because it exactly matches the seed topic and commercial intent while offering by far the highest search volume in the candidate set.\",\"volume\":450000},{\"keyword\":\"full mouth dental implants\",\"reasoning\":\"Strong commercial primary keyword with high volume and clear treatment-shopping intent for a major implant service category.\",\"volume\":110000}],\n  \"secondary\": [{\"keyword\":\"dental implant\",\"reasoning\":\"High-volume singular variant that supports broad relevance and captures users searching for the procedure in general.\",\"volume\":110000},{\"keyword\":\"tooth implant\",\"reasoning\":\"Strong supporting term with substantial volume and commercial intent from users considering a single-tooth replacement option.\",\"volume\":74000},{\"keyword\":\"teeth implants\",\"reasoning\":\"Useful high-volume variant that broadens coverage for users searching less formally for implant treatment.\",\"volume\":60500},{\"keyword\":\"types of dental implants\",\"reasoning\":\"Valuable supporting keyword for comparison-focused commercial research before choosing an implant solution.\",\"volume\":60500},{\"keyword\":\"dental implants for missing teeth\",\"reasoning\":\"Highly intent-aligned long-tail phrase that matches users looking for implants as a solution to missing teeth.\",\"volume\":4400},{\"keyword\":\"dental implants dentist\",\"reasoning\":\"Commercially strong supporting keyword because it signals users looking for a provider who offers dental implants.\",\"volume\":8100},{\"keyword\":\"dental implant procedure\",\"reasoning\":\"Good secondary term for users evaluating what treatment involves before booking or consulting a dentist.\",\"volume\":8100},{\"keyword\":\"dental implant surgery\",\"reasoning\":\"Relevant procedure-focused support keyword that captures users researching the surgical aspect of implant care.\",\"volume\":3600},{\"keyword\":\"benefits of dental implants\",\"reasoning\":\"Helpful supporting informational-commercial keyword for users weighing the value of implants before making a treatment decision.\",\"volume\":2400}],\n  \"warning\": Removed duplicate 'dental implant dentist' keyword.\n}"
            }
        },
        "executionId": "50d424f1-10f2-4d18-8aa2-fccd56f22223"
    }
}


modify it accordingly ... 

Also dont show any data in default in genrator tab ...when the user switches the data and comes back .. make it clear data
