import React, { useState, useRef, useEffect } from "react";
import "./styles.css";

const App = () => {
  const [files, setFiles] = useState([]);
  const [queueData, setQueueData] = useState(null);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const pollIntervalRef = useRef(null);

  // Poll queue status
  const pollQueueStatus = async () => {
    try {
      const res = await fetch("/api/queue");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setQueueData(data);

      // Stop polling if not processing
      if (!data.stats.isProcessing && data.stats.processing === 0) {
        setIsProcessing(false);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    } catch (err) {
      console.error("Poll error:", err);
    }
  };

  // Start polling
  const startPolling = () => {
    if (pollIntervalRef.current) return;
    pollIntervalRef.current = setInterval(pollQueueStatus, 1000);
  };

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...droppedFiles]);
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles((prev) => [...prev, ...selectedFiles]);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setError(null);
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    try {
      console.log(
        "🚀 Uploading files:",
        files.map((f) => f.name)
      );

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      console.log("📡 Response status:", res.status, res.statusText);

      // Safely parse JSON (backend should always send JSON, but protect against HTML error pages)
      const safeParse = async (r) => {
        const text = await r.text();
        console.log("📄 Response body:", text.slice(0, 500));
        try {
          return JSON.parse(text);
        } catch {
          return { _raw: text };
        }
      };

      const data = await safeParse(res);

      if (!res.ok) {
        const errorMsg = data?.error || "Upload failed";
        const details =
          data?.details || data?._raw?.slice(0, 200) || "No additional details";
        const fullError = `${errorMsg}\n\nDetails: ${details}\n\nStatus: ${res.status} ${res.statusText}\n\nURL: ${res.url}`;

        console.error("❌ Upload failed:", fullError);
        throw new Error(fullError);
      }

      console.log("✅ Upload successful:", data);

      if (data.errors) {
        setError(`Some files skipped: ${data.errors.join(", ")}`);
      }

      setFiles([]);
      await pollQueueStatus();
      // Start polling so frontend picks up auto-start processing
      startPolling();
    } catch (err) {
      console.error("❌ Upload error:", err);
      setError(err.message);
    }
  };
  const handleProcessQueue = async () => {
    setError(null);
    setIsProcessing(true);

    try {
      const res = await fetch("/api/process-queue", {
        method: "POST",
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { _raw: text };
      }
      if (!res.ok) {
        throw new Error(data?.error || "Failed to start queue");
      }

      startPolling();
    } catch (err) {
      setError(err.message);
      setIsProcessing(false);
    }
  };

  const handleCancelQueue = async () => {
    try {
      await fetch("/api/cancel-queue", { method: "POST" });
      setError("Processing cancelled");
    } catch (err) {
      console.error("Cancel error:", err);
    }
  };

  const handleClearQueue = async () => {
    if (!confirm("Clear all files from queue?")) return;

    try {
      await fetch("/api/clear-queue", { method: "POST" });
      setQueueData(null);
      setFiles([]);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveFile = async (fileId) => {
    try {
      const res = await fetch(`/api/queue/${fileId}`, { method: "DELETE" });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { _raw: text };
      }
      if (!res.ok) {
        throw new Error(data?.error || "Failed to remove file");
      }
      await pollQueueStatus();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDownload = (fileId) => {
    window.location.href = `/api/download/${fileId}`;
  };

  const handleDownloadAll = () => {
    if (!queueData) return;
    const completed = queueData.files.filter((f) => f.status === "completed");
    if (completed.length === 0) {
      alert("No completed files to download");
      return;
    }

    // Trigger downloads for each completed file
    completed.forEach((file) => {
      const a = document.createElement("a");
      a.href = `/api/download/${file.id}`;
      a.download = `${file.filename}.chunks.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatTime = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const getStatusEmoji = (status) => {
    switch (status) {
      case "pending":
        return "⏳";
      case "processing":
        return "⚡";
      case "completed":
        return "✅";
      case "failed":
        return "❌";
      default:
        return "❓";
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "pending":
        return "#fbbf24";
      case "processing":
        return "#3b82f6";
      case "completed":
        return "#10b981";
      case "failed":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  return (
    <div className="app">
      <div className="scanline"></div>

      <header className="header">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          <h1>
            RAG<span className="accent">MASTER</span>
          </h1>
        </div>
        <p className="tagline">Queue-Based LLM Document Chunking</p>
      </header>

      <div className="container">
        {/* Upload Section */}
        <div className="card">
          <h2>
            <span className="section-icon">📤</span> Upload Files
          </h2>

          <div
            className={`dropzone ${files.length > 0 ? "has-file" : ""} ${
              isDragging ? "dragging" : ""
            }`}
            onClick={() => document.getElementById("fileInput").click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="dropzone-icon">📁</div>
            <h3>
              {files.length > 0
                ? `${files.length} files selected`
                : "Drop files here or click to browse"}
            </h3>
            <p className="dropzone-hint">
              Up to 50 files • Max 1MB per file • Total 10MB • No images
            </p>
            <input
              id="fileInput"
              type="file"
              accept=".md,.markdown,.txt,.json,.csv,.log,.xml,.html,.rtf"
              onChange={handleFileSelect}
              multiple
              style={{ display: "none" }}
            />
          </div>

          {files.length > 0 && (
            <div className="file-list">
              {files.map((file, idx) => (
                <div key={idx} className="file-item">
                  <span>📄 {file.name}</span>
                  <span className="file-size">{formatSize(file.size)}</span>
                </div>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <div className="button-group">
              <button className="btn-primary" onClick={handleUpload}>
                Add to Queue ({files.length} files)
              </button>
              <button className="btn-secondary" onClick={() => setFiles([])}>
                Clear Selection
              </button>
            </div>
          )}
        </div>

        {/* Queue Status */}
        {queueData && queueData.stats.totalFiles > 0 && (
          <div className="card">
            <h2>
              <span className="section-icon">📊</span> Queue Status
            </h2>

            <div className="stats-grid">
              <div className="stat-box">
                <div className="stat-value">{queueData.stats.totalFiles}</div>
                <div className="stat-label">Total Files</div>
              </div>
              <div className="stat-box">
                <div className="stat-value" style={{ color: "#fbbf24" }}>
                  {queueData.stats.pending}
                </div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat-box">
                <div className="stat-value" style={{ color: "#3b82f6" }}>
                  {queueData.stats.processing}
                </div>
                <div className="stat-label">Processing</div>
              </div>
              <div className="stat-box">
                <div className="stat-value" style={{ color: "#10b981" }}>
                  {queueData.stats.completed}
                </div>
                <div className="stat-label">Completed</div>
              </div>
              <div className="stat-box">
                <div className="stat-value" style={{ color: "#ef4444" }}>
                  {queueData.stats.failed}
                </div>
                <div className="stat-label">Failed</div>
              </div>
            </div>

            <div className="button-group">
              {queueData.stats.pending > 0 && !isProcessing && (
                <button className="btn-primary" onClick={handleProcessQueue}>
                  🚀 Process Queue ({queueData.stats.pending} files)
                </button>
              )}

              {isProcessing && (
                <button className="btn-danger" onClick={handleCancelQueue}>
                  ❌ Cancel Processing
                </button>
              )}

              <button className="btn-secondary" onClick={pollQueueStatus}>
                🔄 Refresh
              </button>

              <button className="btn-secondary" onClick={handleClearQueue}>
                🗑️ Clear All
              </button>
            </div>
          </div>
        )}

        {/* Results Table */}
        {queueData && queueData.files.length > 0 && (
          <div className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2>
                <span className="section-icon">📋</span> Processing Results
              </h2>
              <div>
                <button
                  className="btn-secondary"
                  onClick={handleDownloadAll}
                  disabled={
                    !(queueData.files || []).some(
                      (f) => f.status === "completed"
                    )
                  }
                >
                  ⬇️ Download All
                </button>
              </div>
            </div>

            <div className="table-container">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Filename</th>
                    <th>Size</th>
                    <th>Chunks</th>
                    <th>Keywords</th>
                    <th>Time</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queueData.files.map((file) => (
                    <tr key={file.id}>
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            backgroundColor: getStatusColor(file.status),
                          }}
                        >
                          {getStatusEmoji(file.status)} {file.status}
                        </span>
                      </td>
                      <td className="filename-cell">{file.filename}</td>
                      <td>{formatSize(file.originalSize)}</td>
                      <td>{file.metrics.chunkCount || "-"}</td>
                      <td>{file.metrics.keywordCount || "-"}</td>
                      <td>
                        {file.metrics.processingTimeMs
                          ? formatTime(file.metrics.processingTimeMs)
                          : "-"}
                      </td>
                      <td>
                        {file.status === "completed" && (
                          <button
                            className="btn-download"
                            onClick={() => handleDownload(file.id)}
                          >
                            ⬇️ Download
                          </button>
                        )}
                        {file.status === "pending" && (
                          <button
                            className="btn-remove"
                            onClick={() => handleRemoveFile(file.id)}
                          >
                            🗑️
                          </button>
                        )}
                        {file.status === "failed" && (
                          <span className="error-text" title={file.error}>
                            ⚠️
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Errors */}
        {error && (
          <div className="error-box">
            <pre
              style={{
                whiteSpace: "pre-wrap",
                margin: 0,
                fontFamily: "monospace",
                fontSize: "12px",
              }}
            >
              ❌ {error}
            </pre>
          </div>
        )}
      </div>

      <footer className="footer">
        <div className="grid-overlay"></div>
        <p>Powered by GPT-5-mini • Batch Processing • 4s Cooling Delay</p>
      </footer>
    </div>
  );
};

export default App;
