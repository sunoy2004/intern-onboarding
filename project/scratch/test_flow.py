import asyncio
import httpx
import base64
import json

GATEWAY_URL = "http://localhost:8000"

async def test_full_onboarding_flow():
    print("1. Logging in as Candidate...")
    async with httpx.AsyncClient() as client:
        # Step 1: Login
        login_res = await client.post(f"{GATEWAY_URL}/auth/login", json={
            "email": "candidate1@company.com",
            "password": "Candidate@123"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        login_data = login_res.json()
        token = login_data["access_token"]
        print(f"   Success! Token acquired.")
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # Step 2: Fetch profile
        profile_res = await client.get(f"{GATEWAY_URL}/candidates/me", headers=headers)
        assert profile_res.status_code == 200, f"Fetch profile failed: {profile_res.text}"
        profile_data = profile_res.json()
        print(f"   Candidate Name: {profile_data['candidate']['legal_name'] if 'legal_name' in profile_data['candidate'] else 'John Candidate'}")
        print(f"   Onboarding Status: {profile_data['candidate']['status']}")

        # Step 3: Sign offer letter
        print("2. E-Signing Offer Letter...")
        sign_res = await client.post(f"{GATEWAY_URL}/candidates/sign", headers=headers, json={
            "signature_data": "John Candidate Sign",
            "ip_address": "127.0.0.1"
        })
        assert sign_res.status_code == 200, f"Signing failed: {sign_res.text}"
        print(f"   Success: {sign_res.json()}")

        # Step 4: Verify bank details
        print("3. Verifying Bank Details...")
        bank_res = await client.post(f"{GATEWAY_URL}/candidates/bank/verify", headers=headers, json={
            "bank_account_number": "123456789012",
            "ifsc_code": "SBIN0001234",
            "full_name": "John Candidate"
        })
        assert bank_res.status_code == 200, f"Bank verification failed: {bank_res.text}"
        print(f"   Success: {bank_res.json()}")

        # Step 5: Upload PAN Card (Base64)
        print("4. Uploading PAN Card...")
        # Create a small dummy image in base64
        dummy_base64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        pan_res = await client.post(f"{GATEWAY_URL}/candidates/documents/upload", headers=headers, json={
            "doc_type": "pan_card",
            "file_name": "pan_card.png",
            "file_base64": dummy_base64
        })
        assert pan_res.status_code == 200, f"PAN Upload failed: {pan_res.text}"
        print(f"   Success: {pan_res.json()}")

        # Step 6: Upload Aadhaar Card (Base64)
        print("5. Uploading Aadhaar Card...")
        aadhaar_res = await client.post(f"{GATEWAY_URL}/candidates/documents/upload", headers=headers, json={
            "doc_type": "aadhaar_card",
            "file_name": "aadhaar_card.png",
            "file_base64": dummy_base64
        })
        assert aadhaar_res.status_code == 200, f"Aadhaar Upload failed: {aadhaar_res.text}"
        print(f"   Success: {aadhaar_res.json()}")

        # Wait for agents and orchestrator to process events
        print("6. Waiting for background agents to complete IT and Inventory setups...")
        await asyncio.sleep(5)

        # Check final status
        final_profile_res = await client.get(f"{GATEWAY_URL}/candidates/me", headers=headers)
        assert final_profile_res.status_code == 200
        final_data = final_profile_res.json()
        print(f"   Final Onboarding Status: {final_data['candidate']['status']}")
        
        # Verify IT Account Provisioning
        it_res = await client.get(f"{GATEWAY_URL}/it/candidates", headers={
            "Authorization": f"Bearer {token}",  # Candidate role cannot access IT endpoint directly
            "Content-Type": "application/json"
        })
        print(f"   IT access check status: {it_res.status_code} (Expected: 403 Forbidden)")

        # Log in as HR/Admin to check the status of IT candidates
        print("7. Logging in as Admin...")
        admin_login_res = await client.post(f"{GATEWAY_URL}/auth/login", json={
            "email": "admin@company.com",
            "password": "Admin@123"
        })
        assert admin_login_res.status_code == 200
        admin_token = admin_login_res.json()["access_token"]
        
        it_candidates_res = await client.get(f"{GATEWAY_URL}/it/candidates", headers={
            "Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"
        })
        assert it_candidates_res.status_code == 200
        it_candidates = it_candidates_res.json()
        candidate_info = next((c for c in it_candidates if c["personal_email"] == "candidate1@company.com"), None)
        assert candidate_info is not None, "Candidate not found in IT profile list"
        
        print("\n=== VERIFICATION SUCCESSFUL ===")
        print(f"Candidate name: {candidate_info['name']}")
        print(f"Onboarding Status: {candidate_info['onboarding_status']}")
        print(f"Corporate Email: {candidate_info['corporate_email']}")
        print(f"Assigned Assets: {candidate_info['assets']}")
        print("===============================\n")

if __name__ == "__main__":
    asyncio.run(test_full_onboarding_flow())
