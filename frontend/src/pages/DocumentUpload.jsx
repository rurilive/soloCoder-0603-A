import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { documentAPI } from '../api.js'

export default function DocumentUpload() {
  const navigate = useNavigate()
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [watermarkEnabled, setWatermarkEnabled] = useState(false)
  const [watermarkText, setWatermarkText] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const fileInputRef = useRef(null)

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0])
      setError('')
    }
  }

  const handleFileSelect = (e) => {
    if (e.target.files.length > 0) {
      setFile(e.target.files[0])
      setError('')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) {
      setError('请选择要上传的文件')
      return
    }
    setError('')
    setLoading(true)
    setUploadProgress(0)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('watermark_enabled', watermarkEnabled)
    if (watermarkEnabled && watermarkText) {
      formData.append('watermark_text', watermarkText)
    }
    formData.append('is_public', isPublic)

    try {
      const res = await documentAPI.upload(formData, (progress) => {
        setUploadProgress(progress)
      })
      const uploaded = res.data
      if (confirm('上传成功！是否立即转换为可预览格式？')) {
        try {
          await documentAPI.convert(uploaded.id, watermarkEnabled, watermarkText)
          navigate(`/preview/${uploaded.id}`)
        } catch (err) {
          alert('文档已上传，但转换失败：' + (err.response?.data?.detail || err.message))
          navigate('/documents')
        }
      } else {
        navigate('/documents')
      }
    } catch (err) {
      setError(err.response?.data?.detail || '上传失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-container">
      <h1 className="page-title">上传文档</h1>

      <form onSubmit={handleSubmit}>
        <div
          className={`upload-area ${dragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".docx,.pdf,.png,.jpg,.jpeg,.gif,.bmp,.webp"
            style={{ display: 'none' }}
          />
          <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
          {file ? (
            <div>
              <p><strong>{file.name}</strong></p>
              <p className="upload-hint">{(file.size / 1024 / 1024).toFixed(2)} MB - 点击重新选择</p>
            </div>
          ) : (
            <div>
              <p>点击选择文件或将文件拖拽到此处</p>
              <p className="upload-hint">支持：DOCX、PDF、PNG、JPG、GIF、BMP、WEBP</p>
            </div>
          )}
          {loading && uploadProgress > 0 && (
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }}></div>
            </div>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="upload-options">
          <h3>上传选项</h3>
          <div className="checkbox-group">
            <input
              type="checkbox"
              id="watermark"
              checked={watermarkEnabled}
              onChange={(e) => setWatermarkEnabled(e.target.checked)}
            />
            <label htmlFor="watermark">启用水印</label>
          </div>
          {watermarkEnabled && (
            <div className="form-group">
              <label>水印文字（留空则使用当前用户名）</label>
              <input
                type="text"
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                placeholder="例如：内部文档，请勿外传"
              />
            </div>
          )}
          <div className="checkbox-group">
            <input
              type="checkbox"
              id="public"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            <label htmlFor="public">设为公开文档（所有登录用户可查看）</label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={loading || !file}>
            {loading ? '上传中...' : '上传文档'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/documents')}
          >
            取消
          </button>
        </div>
      </form>
    </div>
  )
}
