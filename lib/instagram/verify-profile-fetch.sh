#!/bin/bash
# Manual verification helper for Instagram profile fetch
# Usage: ./verify-profile-fetch.sh <ig_scoped_id> <access_token>

if [ $# -lt 2 ]; then
  echo "Usage: $0 <ig_scoped_id> <access_token>"
  echo "Example: $0 1463464772093025 YOUR_ACCESS_TOKEN"
  exit 1
fi

IG_SCOPED_ID=$1
ACCESS_TOKEN=$2
API_VERSION="v24.0"

echo "Fetching profile for IGSID: $IG_SCOPED_ID"
echo "API Version: $API_VERSION"
echo ""

curl -G "https://graph.instagram.com/${API_VERSION}/${IG_SCOPED_ID}" \
     -d "fields=name,username,profile_pic" \
     -d "access_token=${ACCESS_TOKEN}" \
     | jq '.'

echo ""
echo "Note: profile_pic URLs expire in ~3 days"

