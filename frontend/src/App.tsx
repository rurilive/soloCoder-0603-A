import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ScriptList from './pages/ScriptList';
import ScriptEditor from './pages/ScriptEditor';
import TaskList from './pages/TaskList';
import TaskEditor from './pages/TaskEditor';
import Results from './pages/Results';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/scripts" element={<ScriptList />} />
        <Route path="/scripts/new" element={<ScriptEditor />} />
        <Route path="/scripts/:id" element={<ScriptEditor />} />
        <Route path="/tasks" element={<TaskList />} />
        <Route path="/tasks/new" element={<TaskEditor />} />
        <Route path="/tasks/:id" element={<TaskEditor />} />
        <Route path="/results" element={<Results />} />
      </Routes>
    </Layout>
  );
}

export default App;
