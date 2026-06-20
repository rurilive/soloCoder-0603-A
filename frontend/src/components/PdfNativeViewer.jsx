import React, { useState, useEffect, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

export default function PdfNativeViewer({ docId, onTotalPages, onCurrentPage }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const textLayerRef = useRef(null)
  const highlightLayerRef = useRef(null)
  const pdfDocRef = useRef(null)
  const renderTaskRef = useRef(null)

  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [currentMatch, setCurrentMatch] = useState(0)
  const [searching, setSearching] = useState(false)
  const [rendering, setRendering] = useState(false)

  const pdfUrl = `/api/documents/${docId}/pdf/file?token=${encodeURIComponent(localStorage.getItem('token') || '')}`

  const loadPdf = useCallback(async () => {
    try {
      const loadingTask = pdfjsLib.getDocument(pdfUrl)
      const pdf = await loadingTask.promise
      pdfDocRef.current = pdf
      setTotalPages(pdf.numPages)
      if (onTotalPages) onTotalPages(pdf.numPages)
    } catch (err) {
      console.error('PDF 加载失败:', err)
    }
  }, [pdfUrl, onTotalPages])

  useEffect(() => {
    loadPdf()
  }, [loadPdf])

  const renderPage = useCallback(async (pageNum) => {
    const pdf = pdfDocRef.current
    if (!pdf) return
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel()
      renderTaskRef.current = null
    }
    setRendering(true)
    try {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      canvas.height = viewport.height
      canvas.width = viewport.width

      const textLayer = textLayerRef.current
      if (textLayer) {
        textLayer.style.width = viewport.width + 'px'
        textLayer.style.height = viewport.height + 'px'
      }

      const highlightLayer = highlightLayerRef.current
      if (highlightLayer) {
        highlightLayer.style.width = viewport.width + 'px'
        highlightLayer.style.height = viewport.height + 'px'
      }

      const renderTask = page.render({
        canvasContext: ctx,
        viewport: viewport,
      })
      renderTaskRef.current = renderTask
      await renderTask.promise
      renderTaskRef.current = null

      const textContent = await page.getTextContent()
      if (textLayer) {
        textLayer.innerHTML = ''
        try {
          const { TextLayer } = await import('pdfjs-dist')
          if (TextLayer) {
            const tl = new TextLayer({
              textContentSource: textContent,
              container: textLayer,
              viewport: viewport,
            })
            await tl.render()
          }
        } catch {
          textLayer.innerHTML = ''
          const textItems = textContent.items
          for (const item of textItems) {
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
            const span = document.createElement('span')
            span.textContent = item.str
            span.style.position = 'absolute'
            span.style.left = tx[4] + 'px'
            span.style.top = (tx[5] - item.height * tx[3]) + 'px'
            span.style.fontSize = Math.abs(tx[3]) + 'px'
            span.style.color = 'transparent'
            span.style.whiteSpace = 'pre'
            textLayer.appendChild(span)
          }
        }
      }

      renderSearchHighlights(pageNum, viewport)

      if (onCurrentPage) onCurrentPage(pageNum)
    } catch (err) {
      if (err.name !== 'RenderingCancelledException') {
        console.error('页面渲染失败:', err)
      }
    } finally {
      setRendering(false)
    }
  }, [scale, onCurrentPage, searchResults, currentMatch])

  useEffect(() => {
    if (pdfDocRef.current) {
      renderPage(currentPage)
    }
  }, [currentPage, renderPage])

  const renderSearchHighlights = useCallback((pageNum, viewport) => {
    const highlightLayer = highlightLayerRef.current
    if (!highlightLayer) return
    highlightLayer.innerHTML = ''
    if (searchResults.length === 0) return

    const pageResults = searchResults.filter((r) => r.page === pageNum)
    pageResults.forEach((result, idx) => {
      const globalIdx = searchResults.indexOf(result)
      const isActive = globalIdx === currentMatch
      const rect = document.createElement('div')
      rect.className = 'pdf-highlight-rect'
      if (isActive) rect.classList.add('active')
      const tx = viewport.transform
      const x = result.x0 * tx[0] + result.y0 * tx[2] + tx[4]
      const y = result.y0 * tx[1] + result.y1 * tx[3] + tx[5]
      const width = (result.x1 - result.x0) * tx[0]
      const height = (result.y1 - result.y0) * Math.abs(tx[3])
      rect.style.left = x + 'px'
      rect.style.top = y + 'px'
      rect.style.width = Math.abs(width) + 'px'
      rect.style.height = Math.abs(height) + 'px'
      highlightLayer.appendChild(rect)
    })
  }, [searchResults, currentMatch])

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setCurrentMatch(0)
      return
    }
    setSearching(true)
    try {
      const res = await fetch(
        `/api/documents/${docId}/pdf/search?q=${encodeURIComponent(searchQuery.trim())}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } }
      )
      const data = await res.json()
      setSearchResults(data.results || [])
      setCurrentMatch(0)
      if (data.results && data.results.length > 0) {
        const firstPage = data.results[0].page
        setCurrentPage(firstPage)
      }
    } catch (err) {
      console.error('搜索失败:', err)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [searchQuery, docId])

  const handlePrevMatch = useCallback(() => {
    if (searchResults.length === 0) return
    const prev = (currentMatch - 1 + searchResults.length) % searchResults.length
    setCurrentMatch(prev)
    const targetPage = searchResults[prev].page
    if (targetPage !== currentPage) setCurrentPage(targetPage)
  }, [currentMatch, searchResults, currentPage])

  const handleNextMatch = useCallback(() => {
    if (searchResults.length === 0) return
    const next = (currentMatch + 1) % searchResults.length
    setCurrentMatch(next)
    const targetPage = searchResults[next].page
    if (targetPage !== currentPage) setCurrentPage(targetPage)
  }, [currentMatch, searchResults, currentPage])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSearch()
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      handlePrevMatch()
    } else if (e.key === 'F3' || (e.ctrlKey && e.key === 'g')) {
      e.preventDefault()
      if (e.shiftKey) handlePrevMatch()
      else handleNextMatch()
    }
  }, [handleSearch, handlePrevMatch, handleNextMatch])

  const goPrevPage = () => setCurrentPage((p) => Math.max(1, p - 1))
  const goNextPage = () => setCurrentPage((p) => Math.min(totalPages, p + 1))
  const zoomIn = () => setScale((s) => Math.min(3.0, s + 0.25))
  const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.25))

  return (
    <div className="pdf-native-viewer">
      <div className="pdf-toolbar">
        <div className="pdf-toolbar-group">
          <button className="btn btn-secondary btn-sm" onClick={goPrevPage} disabled={currentPage <= 1}>
            ◀
          </button>
          <span className="pdf-page-info">
            第 <strong>{currentPage}</strong> / {totalPages} 页
          </span>
          <button className="btn btn-secondary btn-sm" onClick={goNextPage} disabled={currentPage >= totalPages}>
            ▶
          </button>
        </div>
        <div className="pdf-toolbar-group">
          <button className="btn btn-secondary btn-sm" onClick={zoomOut}>-</button>
          <span className="pdf-zoom-info">{Math.round(scale * 100)}%</span>
          <button className="btn btn-secondary btn-sm" onClick={zoomIn}>+</button>
        </div>
        <div className="pdf-toolbar-group pdf-search-group">
          <input
            type="text"
            className="pdf-search-input"
            placeholder="搜索文本..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
          >
            {searching ? '...' : '搜索'}
          </button>
          {searchResults.length > 0 && (
            <>
              <span className="pdf-search-count">
                {currentMatch + 1} / {searchResults.length}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={handlePrevMatch}>▲</button>
              <button className="btn btn-secondary btn-sm" onClick={handleNextMatch}>▼</button>
            </>
          )}
        </div>
      </div>
      <div className="pdf-canvas-container" ref={containerRef}>
        <div className="pdf-page-wrapper">
          <canvas ref={canvasRef} />
          <div ref={textLayerRef} className="pdf-text-layer" />
          <div ref={highlightLayerRef} className="pdf-highlight-layer" />
        </div>
      </div>
    </div>
  )
}
