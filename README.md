# 多文件上传

1. 批量上传
2. 断点上传

## Init Go

`$ go mod init main`

## Server

`$ go run server.go`

## dev

`$ npm run dev`

## DB

using sqlite3

```sql
CREATE TABLE "upload_file" (
	md5	TEXT PRIMARY KEY, -- 主键
	uploaded	INTEGER, -- 是否上传完成 0:未完成 1:已完成
  await_chunks TEXT, -- 未上传的片段
  total_chunks INTEGER, -- 总片段数
  create_time INTEGER, -- 创建时间
  update_time INTEGER, -- 更新时间
)
```

## dev router

1. [x] single file upload
2. [x] single file upload with md5 hash to check duplicate, using sqlite3 to save md5
3. [x] single file slice upload with const chunk size
4. [x] multi file slice upload with const chunk size
5. [x] multi file slice upload with const chunk size
6. [x] show upload speed and remaining time
7. [ ] upload using dynamic chunk size
