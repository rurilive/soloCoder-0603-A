import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Toast from './components/Toast.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ContentTypes from './pages/ContentTypes.jsx'
import ContentTypeForm from './pages/ContentTypeForm.jsx'
import FieldsManager from './pages/FieldsManager.jsx'
import Entries from './pages/Entries.jsx'
import EntryEdit from './pages/EntryEdit.jsx'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="content-types" element={<ContentTypes />} />
          <Route path="content-types/new" element={<ContentTypeForm />} />
          <Route path="content-types/:id/edit" element={<ContentTypeForm />} />
          <Route path="content-types/:id/fields" element={<FieldsManager />} />
          <Route path="entries/:contentTypeSlug" element={<Entries />} />
          <Route path="entries/:contentTypeSlug/new" element={<EntryEdit />} />
          <Route path="entries/:contentTypeSlug/:entryId/edit" element={<EntryEdit />} />
        </Route>
      </Routes>
      <Toast />
    </>
  )
}
