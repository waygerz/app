from app.utils.config import Config

API = "/v1/platform/media"


def test_presign_complete_and_get(client, auth_headers):
    presign = client.post(
        f"{API}/uploads/presign",
        json={"purpose": "comment", "content_type": "image/png", "byte_size": 2048},
        headers=auth_headers,
    )
    assert presign.status_code == 201
    asset_id = presign.get_json()["asset"]["id"]
    assert presign.get_json()["mock"] is True

    complete = client.post(f"{API}/uploads/{asset_id}/complete", headers=auth_headers)
    assert complete.status_code == 200
    assert complete.get_json()["asset"]["status"] == "ready"
    assert "download_url" in complete.get_json()["asset"]

    get_res = client.get(f"{API}/uploads/{asset_id}", headers=auth_headers)
    assert get_res.status_code == 200


def test_internal_verify(client, auth_headers):
    presign = client.post(
        f"{API}/uploads/presign",
        json={"purpose": "message", "content_type": "image/jpeg", "byte_size": 1024},
        headers=auth_headers,
    )
    asset_id = presign.get_json()["asset"]["id"]
    client.post(f"{API}/uploads/{asset_id}/complete", headers=auth_headers)

    verify = client.post(
        "/internal/verify",
        json={
            "user_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "purpose": "message",
            "asset_ids": [asset_id],
        },
        headers={"X-Internal-Token": Config.INTERNAL_TOKEN},
    )
    assert verify.status_code == 200
    assert len(verify.get_json()["assets"]) == 1


def test_rejects_oversize_gif(client, auth_headers):
    res = client.post(
        f"{API}/uploads/presign",
        json={"purpose": "comment", "content_type": "image/gif", "byte_size": 20 * 1024 * 1024},
        headers=auth_headers,
    )
    assert res.status_code == 400