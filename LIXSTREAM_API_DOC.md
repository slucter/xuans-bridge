# Lixstream API Documentation

## Table of Contents
- [API Key](#api-key)
- [Introduction](#introduction)
- [Rate Limits](#rate-limits)
- [Local Upload](#local-upload)
- [Remote Upload](#remote-upload)
- [Create Folder](#create-folder)
- [Get Paginated File List](#get-paginated-file-list)
- [Resource Search](#resource-search)

---

## API Key

**Base URL:** `https://api.luxsioab.com/pub/api`

**API Key Format:**
- **POST Request:** Use the API key as provided (POST is recommended)
- **GET Request:** URL encode the API key (e.g., `jdtcX1dYFXh7bc4V%2F8vaWFzE%2BK9hSE7CS8XI80%2FFPR0%3D`)

**Example API Key:** `jdtcX1dYFXh7bc4V/8vaWFzE+K9hSE7CS8XI80/FPR0=`

---

## Introduction

We provide developers with a lightweight HTTP API that enables quick integration with the Lixstream platform. All API requests must be made using either the GET or POST method.

---

## Rate Limits

API requests are limited to a maximum of **10 per second**. If you need a higher request rate, please contact us to apply for an increased quota.

---

## Local Upload

The local upload process is divided into three steps:
1. Create an upload task
2. Upload the file to the cloud
3. Receive a callback to confirm the upload result

### 1. Create an Upload Task

Creates an upload task and returns the target upload URL along with the required request headers.

**Endpoint:** `POST https://api.luxsioab.com/pub/api/local/upload`

**Headers:**
| Key | Value | Description | Required |
|-----|-------|-------------|----------|
| Content-Type | application/json | - | Yes |

**Request Body Parameters:**
| Parameter | Description | Required | Type |
|-----------|-------------|----------|------|
| key | API key, used for authentication | Yes | string |
| name | The name of the uploaded file (including the file extension) | Yes | string |
| dir_id | Parent directory ID; can be null to indicate upload to the root directory | No | string |

**Request Example (cURL):**
```bash
curl -X POST -H 'Content-Type: application/json' \
  https://api.luxsioab.com/pub/api/local/upload \
  --data '{
    "key": "your_api_key",
    "name": "file.mp4",
    "dir_id": "123456"
}'
```

**Success Response:**
| Field | Type | Return | Description |
|-------|------|--------|-------------|
| data.url | string | Yes | Upload URL used for the subsequent PUT request |
| data.header | object | Yes | Header information required for the upload request (e.g., Content-Type) |
| data.id | string | Yes | Unique identifier of the upload task, used for callback reference |
| code | int | Yes | Status code, 200 indicates success |
| msg | string | Yes | Message describing the result |
| timestamp | string | Yes | Timestamp of the response |

**Response Example:**
```json
{
  "data": {
    "url": "https://xxx.xxcloud.com/xxx/file.mp4?AccessKeyId=...&Expires=1748946388&Signature=...",
    "header": {
      "Content-Type": "video/mp4"
    },
    "id": "upload-task-id"
  },
  "code": 200,
  "msg": "success",
  "timestamp": "2025-06-04 13:22:09"
}
```

### 2. Upload Local File

Use the URL and Content-Type returned in Step 1 to upload the file to object storage via a PUT request.

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| url | The data.url returned in Step 1 |
| Content-Type | The data.header.Content-Type returned in Step 1 |
| @file.mp4 | Local file path; replace with the actual file path |

⚠️ **Important:** The upload URL usually contains a signature and expiration time. Make sure to complete the upload within the valid time window.

**Request Example (cURL):**
```bash
curl --location --request PUT 'https://xxx.xxcloud.com/xxx/67b4718d-7a6f-4b65-8a56-06fc26c3499c.mp4?AccessKeyId=...&Expires=1748946388&Signature=...' \
  --header 'Content-Type: video/mp4' \
  --data-binary '@/path/to/your/file.mp4'
```

### 3. Callback to Confirm Upload Result

After the upload is completed, the client must actively call this endpoint to notify the platform of the upload status.

**Endpoint:** `POST https://api.luxsioab.com/pub/api/local/upload/callback`

**Headers:**
| Key | Value | Description | Required |
|-----|-------|-------------|----------|
| Content-Type | application/json | - | Yes |

**Request Body Parameters:**
| Parameter | Description | Required | Type |
|-----------|-------------|----------|------|
| key | API key | Yes | string |
| result | Upload result: true indicates success, false indicates failure | Yes | boolean |
| id | Upload task ID, returned as data.id in Step 1 | Yes | string |

**Request Example (cURL):**
```bash
curl -X POST -H 'Content-Type: application/json' \
  https://api.luxsioab.com/pub/api/local/upload/callback \
  --data '{
    "key": "your_api_key",
    "result": true,
    "id": "upload-task-id"
}'
```

**Success Response:**
| Field | Type | Return | Description |
|-------|------|--------|-------------|
| data.file_name | string | Yes | Display name of the uploaded file |
| data.thumbnail_url | string | No | Thumbnail URL of the video file. Returned only for video uploads |
| data.screenshots | array | No | Array of video screenshot URLs, applicable only to video files |
| data.dir_share_link | string | No | Share link of the folder where the file was uploaded, returned when the folder is shared |
| data.file_share_link | string | No | Public share link of the uploaded file, returned when file sharing is enabled |
| data.file_embed_link | string | No | Embed link of the uploaded file, usually used in video players. Returned when sharing is enabled |
| code | int | Yes | Status code, 200 indicates success |
| msg | string | Yes | Message describing the result |
| timestamp | string | Yes | Timestamp of the response |

**Response Example:**
```json
{
  "data": {
    "file_name": "30210195727-1-16.mp4",
    "thumbnail_url": "https://xxx.xxxx.com/thumbnails/xx-streaming/193014xxxx7964546/9deeedf3-xxx-xxxx-b2c4-3f4395af6d63.jpg",
    "dir_share_link": "https://xxx.xxxx.com/d/BYxxxGf",
    "file_share_link": "https://xxx.xxxx.com/s/TLxxxXJq",
    "file_embed_link": "https://xxx.xxxx.com/e/TLxxxXJq"
  },
  "code": 200,
  "msg": "success",
  "timestamp": "2025-06-05 07:27:12"
}
```

---

## Remote Upload

Create a remote file upload task. The platform will fetch the file from the specified URL and save it to the user's directory.

**Endpoint:** `POST https://api.luxsioab.com/pub/api/remote/upload`

**Headers:**
| Key | Value | Description | Required |
|-----|-------|-------------|----------|
| Content-Type | application/json | - | Yes |

**Request Body Parameters:**
| Parameter | Description | Required | Type |
|-----------|-------------|----------|------|
| key | The user's API key used for authentication | Yes | string |
| name | Name of the file to upload (including the file extension) | Yes | string |
| dir_id | ID of the parent directory. If omitted, the file will be uploaded to root | No | string |
| url | URL of the file to upload | Yes | string |

**Request Example (cURL):**
```bash
curl -X POST -k -H 'Content-Type: application/json' -i \
  https://api.luxsioab.com/pub/api/remote/upload \
  --data '{
    "key": "your_api_key",
    "name": "file.mp4",
    "dir_id": "your_directory_id",
    "url": "your_upload_url"
}'
```

**Success Response:**
| Field | Type | Return | Description |
|-------|------|--------|-------------|
| data.id | string | Yes | Unique identifier of the remote upload task |
| data.dir_share_link | string | No | Share link of the folder the file was uploaded to. Returned only if a target directory was specified |
| code | int | Yes | Status code; 200 indicates success |
| msg | string | Yes | Message describing the result |
| timestamp | string | Yes | Timestamp of the response |

**Response Example:**
```json
{
  "data": {
    "id": "remote-upload-task-id-12345",
    "dir_share_link": "https://yourdomain.com/s/abc123"
  },
  "code": 200,
  "msg": "Remote upload task created successfully.",
  "timestamp": "2025-06-05T14:23:45Z"
}
```

---

## Create Folder

Create a new folder, either under a specified parent directory or in the root directory by default.

**Endpoint:** `POST https://api.luxsioab.com/pub/api/directory/create`

**Headers:**
| Key | Value | Description | Required |
|-----|-------|-------------|----------|
| Content-Type | application/json | - | Yes |

**Request Body Parameters:**
| Parameter | Description | Required | Type |
|-----------|-------------|----------|------|
| key | The user's API key used for authentication | Yes | string |
| name | Name of the folder to be created | Yes | string |
| parent_id | ID of the parent directory. If omitted, the folder will be created in the root directory | No | string |

**Request Example (cURL):**
```bash
curl -X POST -H 'Content-Type: application/json' \
  https://api.luxsioab.com/pub/api/directory/create \
  --data '{
    "key": "your_api_key",
    "name": "My Folder",
    "parent_id": "123456"
}'
```

**Success Response:**
| Field | Type | Return | Description |
|-------|------|--------|-------------|
| data.dir_id | string | Yes | Unique identifier of the newly created folder. Can be used to specify the target directory for uploads |
| code | int | Yes | Status code; 200 indicates success |
| msg | string | Yes | Message describing the result |
| timestamp | string | Yes | Timestamp of the response |

**Response Example:**
```json
{
  "data": {
    "dir_id": "46"
  },
  "code": 200,
  "msg": "success",
  "timestamp": "2025-06-04 20:47:33"
}
```

---

## Get Paginated File List

Retrieve a paginated list of file resources accessible to the current user, with support for filtering by directory and upload time.

### POST Method Version

**Endpoint:** `POST https://api.luxsioab.com/pub/api/file/page`

**Headers:**
| Key | Value | Description | Required |
|-----|-------|-------------|----------|
| Content-Type | application/json | - | Yes |

**Request Body Parameters:**
| Parameter | Description | Required | Type |
|-----------|-------------|----------|------|
| key | User API key used for request authentication | Yes | string |
| page_num | Current page number, starting from 1. Minimum value is 1. Default is 1 | No | int32 |
| page_size | Number of records per page. Range: 1–100. Default is 10 | No | int32 |
| dir_id | Parent directory ID. If empty, all files will be queried; if specified, only files under the given directory will be returned | No | string |
| upload_time_millis_after | Filters file records with upload time greater than this timestamp (in milliseconds) | No | int64 |

**Request Example (cURL):**
```bash
curl -X POST -k -H 'Content-Type: application/json' -i \
  https://api.luxsioab.com/pub/api/file/page \
  --data '{
    "key": "your_api_key",
    "page_num": 1,
    "page_size": 10,
    "dir_id": "your_directory_id",
    "upload_time_millis_after": 1749611215000
}'
```

**Success Response:**
| Field | Type | Return | Description |
|-------|------|--------|-------------|
| data.total_pages | int32 | Yes | Total number of pages matching the criteria |
| data.total_elements | int32 | Yes | Total number of files matching the criteria |
| data.size | int32 | Yes | Number of files per page |
| data.number | int32 | Yes | Current page number (0-indexed) |
| data.files | array | Yes | Array of file objects |
| code | int | Yes | Status code; 200 indicates success |
| msg | string | Yes | Message describing the result |
| timestamp | string | Yes | Timestamp of the response |

**File Object Structure:**
| Field | Type | Description |
|-------|------|-------------|
| code | string | File identifier (used in share/embed links) |
| name | string | File name |
| title | string | File title |
| thumbnail | string | Thumbnail URL |
| share_link | string | Share link URL |
| embed_link | string | Embed link URL |
| screenshots | array | Array of screenshot URLs |
| collage_screenshots | array | Array of collage screenshot URLs |
| duration | number | Video duration in seconds |
| dir_id | string | Parent directory ID (optional) |
| upload_time_millis | number | Upload timestamp in milliseconds (optional) |

**Response Example:**
```json
{
  "data": {
    "total_pages": 10,
    "total_elements": 100,
    "size": 10,
    "number": 0,
    "files": [
      {
        "code": "16xxxneq",
        "name": "file.mp4",
        "title": "My Video",
        "thumbnail": "https://xxx.xxxx.com/thumbnails/...",
        "share_link": "https://xxx.xxxx.com/s/16xxxneq",
        "embed_link": "https://xxx.xxxx.com/e/16xxxneq",
        "screenshots": ["https://xxx.xxxx.com/screenshots/..."],
        "collage_screenshots": ["https://xxx.xxxx.com/collage/..."],
        "duration": 120,
        "dir_id": "46",
        "upload_time_millis": 1749611215000
      }
    ]
  },
  "code": 200,
  "msg": "success",
  "timestamp": "2025-06-05 14:23:45"
}
```

### GET Method Version

**Endpoint:** `GET https://api.luxsioab.com/pub/api/file/page`

**Request Query Parameters:**
| Parameter | Description | Required | Type |
|-----------|-------------|----------|------|
| key | User API key (URL encoded) | Yes | string |
| page_num | Current page number, starting from 1. Minimum value is 1. Default is 1 | No | int32 |
| page_size | Number of records per page. Range: 1–100. Default is 10 | No | int32 |
| dir_id | Parent directory ID. If empty, all files will be queried | No | string |
| upload_time_millis_after | Filters file records with upload time greater than this timestamp (in milliseconds) | No | int64 |

**Request Example:**
```
https://api.luxsioab.com/pub/api/file/page?key=your_url_encode_api_key&page_num=1&page_size=10&dir_id=your_directory_id&upload_time_millis_after=1749611215000
```

**Response:** Same as POST method version.

---

## Resource Search

Search for files and folders by name or other criteria.

**Endpoint:** `POST https://api.luxsioab.com/pub/api/search/resource`

**Headers:**
| Key | Value | Description | Required |
|-----|-------|-------------|----------|
| Content-Type | application/json | - | Yes |

**Request Body Parameters:**
| Parameter | Description | Required | Type |
|-----------|-------------|----------|------|
| key | User API key used for request authentication | Yes | string |
| keyword | Search keyword | Yes | string |
| offset | Pagination offset (optional) | No | string |
| limit | Maximum number of results to return (optional) | No | int32 |

**Request Example (cURL):**
```bash
curl -X POST -H 'Content-Type: application/json' \
  https://api.luxsioab.com/pub/api/search/resource \
  --data '{
    "key": "your_api_key",
    "keyword": "search term",
    "limit": 20
}'
```

**Success Response:**
| Field | Type | Return | Description |
|-------|------|--------|-------------|
| data | array | Yes | Array of search result objects |
| code | int | Yes | Status code; 200 indicates success |
| msg | string | Yes | Message describing the result |
| timestamp | string | Yes | Timestamp of the response |

**Search Result Object Structure:**
| Field | Type | Description |
|-------|------|-------------|
| id | string | Resource identifier |
| display_name | string | Display name of the resource |
| size | number | File size in bytes |
| update_time | number | Last update timestamp in milliseconds |
| duration | number | Video duration in seconds (for video files) |
| type | string | Resource type (e.g., "FILE", "FOLDER") |
| thumbnail | string | Thumbnail URL (for video files) |
| offset | string | Pagination offset for next page |
| collage_screenshots | array | Array of collage screenshot URLs (for video files) |

**Response Example:**
```json
{
  "data": [
    {
      "id": "0a755b1b-e878-465c-be56-de023ec332ec",
      "display_name": "11.mp4",
      "size": 25710148,
      "update_time": 1750753499666,
      "duration": 424,
      "type": "FILE",
      "thumbnail": "https://xxxx.com/thumbnails/xbox-streaming/1912040114813538306/2be8dcd9-0af3-425d-bef3-425cd0c43863.jpg",
      "offset": "1750753499666&&0a755b1b-e878-465c-be56-de023ec332ec",
      "collage_screenshots": [
        "https://xxxx.xxxx.com/thumbnails/xbox-streaming/1912040114813538306/2be8dcd9-0af3-425d-bef3-425cd0c43863/screenshot/3x3.jpg"
      ]
    }
  ],
  "code": 200,
  "msg": "success",
  "timestamp": "2025-07-08 08:13:38"
}
```

---

## Error Handling

All API endpoints return a standard response format:

**Success Response:**
```json
{
  "code": 200,
  "msg": "success",
  "data": { ... },
  "timestamp": "2025-06-05 14:23:45"
}
```

**Error Response:**
```json
{
  "code": 400,
  "msg": "Error message describing what went wrong",
  "timestamp": "2025-06-05 14:23:45"
}
```

**Common Error Codes:**
- `200` - Success
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (invalid API key)
- `404` - Not Found
- `500` - Internal Server Error

---

## Notes

1. All timestamps are returned in the format: `YYYY-MM-DD HH:MM:SS` or ISO 8601 format
2. File identifiers (`code`) are used in share links (format: `/s/{code}`) and embed links (format: `/e/{code}`)
3. When uploading files, ensure the upload URL is used before it expires
4. Directory IDs (`dir_id`) can be obtained from the Create Folder endpoint response
5. The API supports both GET and POST methods, but POST is recommended for better security

---

## Support

For API support or to request a higher rate limit, please contact:
- **Telegram:** @lixstream
- **Email:** lixstream.contacts@gmail.com

---

**Last Updated:** 2025-06-05

