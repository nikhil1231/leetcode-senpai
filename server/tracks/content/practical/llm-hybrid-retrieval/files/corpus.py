"""A small help centre. `acl` lists the groups allowed to see a doc; empty means public."""

DOCS = [
    {"id": "d01", "acl": [], "text": "Reset your password from the sign in page if your account is locked."},
    {"id": "d02", "acl": [], "text": "Error ERR-4021 means your session expired. Sign in again to continue."},
    {"id": "d03", "acl": [], "text": "Refunds for annual plans are available within 14 days of payment."},
    {"id": "d04", "acl": [], "text": "Export your data as CSV from Settings, then Download."},
    {"id": "d05", "acl": ["staff"], "text": "Runbook: during an incident with login latency, restart the auth service."},
    {"id": "d06", "acl": [], "text": "Error ERR-5310 appears when an export is larger than 2 GB. Split the export."},
    {"id": "d07", "acl": [], "text": "If the app is slow, check your network and clear the cache."},
    {"id": "d08", "acl": [], "text": "To cancel your subscription, open Billing and choose Cancel plan."},
    {"id": "d09", "acl": ["staff", "billing"], "text": "Internal: issuing a manual refund above the payment limit needs approval."},
    {"id": "d10", "acl": [], "text": "Two-factor (2FA) codes are sent by text or an authenticator app when you sign in."},
]

QUERIES = {
    "what does ERR-4021 mean": {"d02"},
    "i was charged twice, can i get my money back": {"d03"},
    "how do i download a backup of everything": {"d04"},
    "ERR-5310 when exporting": {"d06"},
    "cannot log in, password not accepted": {"d01"},
    "close my plan": {"d08"},
}
