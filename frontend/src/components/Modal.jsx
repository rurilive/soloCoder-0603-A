import React, { useState } from 'react'

export default function Modal({ title, children, onClose, footer, open }) {
  const [show, setShow] = useState(open)

  React.useEffect(() => {
    setShow(open)
  }, [open])

  if (!show) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
