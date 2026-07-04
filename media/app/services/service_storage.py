"""S3 presign + object checks. Mock mode skips AWS in dev."""
from __future__ import annotations

from flask import current_app

from app.utils.mime import matches_declared, sniff_content_type


class StorageError(Exception):
    pass


class StorageBackend:
    def presign_put(self, *, bucket: str, key: str, content_type: str, byte_size: int) -> dict:
        raise NotImplementedError

    def presign_get(self, *, bucket: str, key: str) -> str:
        raise NotImplementedError

    def head_object(self, *, bucket: str, key: str) -> dict:
        raise NotImplementedError

    def read_header(self, *, bucket: str, key: str, length: int = 16) -> bytes:
        raise NotImplementedError


class MockStorage(StorageBackend):
    def presign_put(self, *, bucket: str, key: str, content_type: str, byte_size: int) -> dict:
        return {
            "mock": True,
            "upload_url": None,
            "upload_method": "PUT",
            "upload_headers": {"Content-Type": content_type},
        }

    def presign_get(self, *, bucket: str, key: str) -> str:
        return f"https://mock.local/{bucket}/{key}"

    def head_object(self, *, bucket: str, key: str) -> dict:
        return {"ContentType": "image/png", "ContentLength": 1024}

    def read_header(self, *, bucket: str, key: str, length: int = 16) -> bytes:
        return b"\x89PNG\r\n\x1a\n"


class S3Storage(StorageBackend):
    def _client(self):
        import boto3

        return boto3.client("s3", region_name=current_app.config["AWS_REGION"])

    def presign_put(self, *, bucket: str, key: str, content_type: str, byte_size: int) -> dict:
        client = self._client()
        url = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket,
                "Key": key,
                "ContentType": content_type,
                "ContentLength": byte_size,
            },
            ExpiresIn=current_app.config["MEDIA_PRESIGN_PUT_TTL"],
            HttpMethod="PUT",
        )
        return {
            "mock": False,
            "upload_url": url,
            "upload_method": "PUT",
            "upload_headers": {"Content-Type": content_type},
        }

    def presign_get(self, *, bucket: str, key: str) -> str:
        client = self._client()
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=current_app.config["MEDIA_PRESIGN_GET_TTL"],
        )

    def head_object(self, *, bucket: str, key: str) -> dict:
        from botocore.exceptions import ClientError

        client = self._client()
        try:
            return client.head_object(Bucket=bucket, Key=key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in ("404", "NoSuchKey", "NotFound"):
                raise StorageError("object not found") from exc
            raise StorageError("storage unavailable") from exc

    def read_header(self, *, bucket: str, key: str, length: int = 16) -> bytes:
        client = self._client()
        try:
            resp = client.get_object(Bucket=bucket, Key=key, Range=f"bytes=0-{length - 1}")
            return resp["Body"].read()
        except Exception as exc:
            raise StorageError("could not read object header") from exc


def get_storage() -> StorageBackend:
    if current_app.config["MEDIA_MOCK"]:
        return MockStorage()
    return S3Storage()


def verify_object(storage: StorageBackend, *, asset, declared_type: str) -> tuple[int, str]:
    """Confirm S3 object exists, size/type sane, magic bytes match."""
    if current_app.config["MEDIA_MOCK"]:
        return asset.byte_size, declared_type

    meta = storage.head_object(bucket=asset.s3_bucket, key=asset.s3_key)
    size = int(meta.get("ContentLength") or 0)
    if size <= 0:
        raise StorageError("empty object")
    if size != asset.byte_size:
        raise StorageError("size mismatch")

    header = storage.read_header(bucket=asset.s3_bucket, key=asset.s3_key)
    sniffed = sniff_content_type(header)
    if sniffed != declared_type or not matches_declared(declared_type, header):
        raise StorageError("content type mismatch")
    return size, declared_type