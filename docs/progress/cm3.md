# CM3 progress (Product and Learner Experience) — implementation owner: human developer

Updated once, in a final documentation-only pull request (owner, 4 November 2026); the CM3 completion report is issue #18. Status: Not started, In progress, In review, Changes requested, Merged. Owner decisions of 4 November 2026: G13 and G15 and G24 approved; G26 (CM3-6) not built in CM3.

| Package | Status | Pull request | Evidence summary |
| --- | --- | --- | --- |
| CM3-1 Accessible confirm dialog | In review | [#9](https://github.com/owenganza01/aqs-learning-platform/pull/9) | CI 41798494069: 1213 PASS, e2e 377; live 124 + 1 failed (pre-existing flaky sign-out test; #10 with this commit fully green) |
| CM3-2 Catalogue pagination | In review | [#10](https://github.com/owenganza01/aqs-learning-platform/pull/10) | CI 41800845320: 1213 PASS, e2e 377 + 129 |
| CM3-3 Learner preview (if approved) | In review | [#11](https://github.com/owenganza01/aqs-learning-platform/pull/11) | CI 41801887471: 1213 PASS, e2e 377 + 132; e2e asserts no write calls |
| CM3-4 Mobile player sheet (if approved) | In review | [#12](https://github.com/owenganza01/aqs-learning-platform/pull/12) | Local: new spec 3/3 (390 px focus trap, Escape); CI pending owner approval |
| CM3-5 Self-hosted Inter (if approved) | In review | [#13](https://github.com/owenganza01/aqs-learning-platform/pull/13) | Local: build pass, font spec 1/1 (no Google requests); CSP change proposed for the owner; CI pending owner approval |
| CM3-6 Invitation email (if approved) | Not built (owner decision) | — | Copy-link flow for the first release; provider decided at CM5 (RB7) |
| CM3-7 Replace invented content | In review | [#14](https://github.com/owenganza01/aqs-learning-platform/pull/14) | Local: check:build fails on the old placeholders and passes now; e2e 84 + 63; CI pending owner approval |
| CM3-8 Three bounded refinements | In review | [#16](https://github.com/owenganza01/aqs-learning-platform/pull/16) | Local: full e2e 377 + 146; CI pending owner approval |
| CM3-9 Undesigned-page defects (after owner review) | In review | [#17](https://github.com/owenganza01/aqs-learning-platform/pull/17) | 54 screenshots of every live screen at 390/1440 px; owner to name the 15 pages and defects |
