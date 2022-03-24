self.importScripts("/spark-md5.min.js"); // 导入脚本

// 生成文件 hash
self.onmessage = (e) => {
  const { file } = e.data;
  filehash(file);
};
function filehash(file) {
  var blobSlice =
      File.prototype.slice ||
      File.prototype.mozSlice ||
      File.prototype.webkitSlice,
    chunkSize = 2 * 1024 * 1024, // Read in chunks of 2MB
    chunks = Math.ceil(file.size / chunkSize),
    currentChunk = 0,
    spark = new SparkMD5.ArrayBuffer(),
    fileReader = new FileReader();

  fileReader.onload = function (e) {
    self.postMessage({
      type: "progress",
      chunk: currentChunk + 1,
      chunks: chunks,
    });
    spark.append(e.target.result); // Append array buffer
    currentChunk++;

    if (currentChunk < chunks) {
      loadNext();
    } else {
      self.postMessage({
        type: "finished",
        hash: spark.end(),
      });
    }
  };

  fileReader.onerror = function () {
    self.postMessage({
      type: "error",
    });
  };

  function loadNext() {
    var start = currentChunk * chunkSize,
      end = start + chunkSize >= file.size ? file.size : start + chunkSize;

    fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
  }

  loadNext();
}
