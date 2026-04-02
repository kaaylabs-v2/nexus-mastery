#!/usr/bin/env python3
"""Quick script to wipe all course data via the admin API.
Run from project root: python scripts/reset_all_data.py

Or just use curl:
  curl -X DELETE http://localhost:8000/api/admin/reset-all-data \
    -H "Authorization: Bearer dev:auth0|admin-james"
"""

import httpx
import sys

API_BASE = "http://localhost:8000"
TOKEN = "dev:auth0|admin-james"

def main():
    print("⚠️  This will DELETE all courses, enrollments, sessions, categories,")
    print("   embeddings, files, and mastery profiles for your org.")
    print("   Users and the org itself are preserved.\n")

    confirm = input("Type 'yes' to proceed: ").strip().lower()
    if confirm != "yes":
        print("Aborted.")
        sys.exit(0)

    resp = httpx.delete(
        f"{API_BASE}/api/admin/reset-all-data",
        headers={"Authorization": f"Bearer {TOKEN}"},
        timeout=30.0,
    )

    if resp.status_code == 200:
        data = resp.json()
        print(f"\n✅ {data['message']}\n")
        print("Deleted:")
        for key, count in data["deleted"].items():
            print(f"  {key}: {count}")
    else:
        print(f"\n❌ Failed: {resp.status_code}")
        print(resp.text)

if __name__ == "__main__":
    main()
