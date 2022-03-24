package main

import (
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/mattn/go-sqlite3"
)

func CheckErr(err error) {
	if err != nil {
		panic(err)
	}
}

// exists returns whether the given file or directory exists
func exists(path string) bool {
	_, err := os.Stat(path)
	if err == nil {
		return true
	}
	if os.IsNotExist(err) {
		return false
	}
	return false
}

func mergeFiles(dir string, fileName string) {
	outputDirRead, _ := os.Open("./tmp/" + dir)
	outputDirFiles, _ := outputDirRead.Readdir(0)
	timeStamp := time.Now().UnixNano() / int64(time.Millisecond)
	timeStampString := strconv.FormatInt(timeStamp, 10)
	f, err := os.Create("./tmp/" + timeStampString + "-" + fileName)
	CheckErr(err)
	defer f.Close()
	for i := 0; i < len(outputDirFiles); i++ {
		ff, err := os.Open("./tmp/" + dir + "/" + strconv.Itoa(i))
		CheckErr(err)
		defer ff.Close()
		_, err = io.Copy(f, ff)
		CheckErr(err)
	}
}

func deleteChunks(dir string) {
	outputDirRead, _ := os.Open("./tmp/" + dir)
	outputDirFiles, _ := outputDirRead.Readdir(0)
	for i := 0; i < len(outputDirFiles); i++ {
		os.Remove("./tmp/" + dir + "/" + strconv.Itoa(i))
	}
	os.Remove("./tmp/" + dir)
}

func main() {
	db, err := sql.Open("sqlite3", "/Users/weiye/clondconfconter.db")
	CheckErr(err)
	defer db.Close()
	router := gin.Default()
	router.MaxMultipartMemory = 100 << 10 // 100 G
	router.GET("/", func(c *gin.Context) {
		c.String(http.StatusOK, "I'm a cook server.")
	})
	router.GET("/upload", func(c *gin.Context) {
		var res = 0
		md5 := c.Query("md5")
		count, err := db.Query("SELECT count(1) FROM upload_file WHERE md5 = ?", md5)
		for count.Next() {
			count.Scan(&res)
		}
		CheckErr(err)
		c.JSON(200, gin.H{
			"data":    res,
			"code":    200,
			"msg":     "success",
			"success": true,
		})
	})
	router.POST("/upload/start", func(c *gin.Context) {
		type Request struct {
			Md5      string `json:"md5"`
			Uploaded int    `json:"uploaded"`
		}
		var req Request
		c.Bind(&req)
		timeStamp := time.Now().UnixNano() / int64(time.Millisecond)
		_, err := db.Exec("INSERT INTO upload_file(md5, uploaded, await_chunks, total_chunks, create_time, update_time) values(?,?,?,?,?,?)", req.Md5, req.Uploaded, "", 0, timeStamp, timeStamp)
		data := 1
		if err != nil {
			data = 0
		}
		dir := "./tmp/" + req.Md5 + "/"
		isExists := exists(dir)
		if !isExists {
			os.MkdirAll(dir, os.ModePerm)
		}
		c.JSON(200, gin.H{
			"data":    data,
			"code":    200,
			"msg":     "success",
			"success": true,
		})
	})
	router.POST("/upload/finish", func(c *gin.Context) {
		type Request struct {
			Md5      string `json:"md5"`
			FileName string `json:"fileName"`
			Chunks   int    `json:"chunks"`
		}
		var req Request
		c.Bind(&req)
		outputDirRead, _ := os.Open("./tmp/" + req.Md5)
		outputDirFiles, _ := outputDirRead.Readdir(0)
		if req.Chunks != len(outputDirFiles) {
			c.JSON(200, gin.H{
				"data":    0,
				"code":    100,
				"msg":     "number of chunks error",
				"success": true,
			})
			return
		}
		mergeFiles(req.Md5, req.FileName)
		deleteChunks(req.Md5)
		timeStamp := time.Now().UnixNano() / int64(time.Millisecond)
		_, err := db.Exec("UPDATE upload_file SET uploaded = ?, update_time = ? WHERE md5 = ?", 1, timeStamp, req.Md5)
		data := 1
		if err != nil {
			data = 0
		}
		c.JSON(200, gin.H{
			"data":    data,
			"code":    200,
			"msg":     "success",
			"success": true,
		})
	})

	// full fule upload and not split chunks
	router.POST("/upload/full", func(c *gin.Context) {
		file, err := c.FormFile("file")
		if err != nil {
			c.JSON(200, gin.H{
				"data":    "ok",
				"code":    100,
				"msg":     "files Failed!",
				"success": true,
			})
			fmt.Print(err)
			return
		}
		fmt.Printf("Received file: %+v\n", file.Filename)
		fmt.Printf("Received file: %+v\n", file.Size)
		c.SaveUploadedFile(file, "./tmp/"+file.Filename)
		c.JSON(200, gin.H{
			"data":    "ok",
			"code":    200,
			"msg":     "files uploaded!",
			"success": true,
		})
	})

	router.POST("/upload/chunks", func(c *gin.Context) {
		file, err := c.FormFile("file")
		chunk := c.PostForm("chunk")
		md5 := c.PostForm("md5")
		if err != nil {
			c.JSON(200, gin.H{
				"data":    "ok",
				"code":    100,
				"msg":     "files Failed!",
				"success": true,
			})
			fmt.Print(err)
			return
		}
		fmt.Printf("Received file: %+v\n", file.Size)
		c.SaveUploadedFile(file, "./tmp/"+md5+"/"+chunk)
		c.JSON(200, gin.H{
			"data":    "ok",
			"code":    200,
			"msg":     "files uploaded!",
			"success": true,
		})
	})

	router.Run() // listen and serve on 0.0.0.0:8080 (for windows "http://localhost:8080")
}
