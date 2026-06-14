import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ScriptList from './pages/ScriptList';
import ScriptEditor from './pages/ScriptEditor';
import TaskList from './pages/TaskList';
import TaskEditor from './pages/TaskEditor';
import Results from './pages/Results';
import VisualConfigList from './pages/VisualConfigList';
import VisualConfigEditor from './pages/VisualConfigEditor';
import Debugger from './pages/Debugger';
import CleaningPipelineList from './pages/CleaningPipelineList';
import CleaningPipelineEditor from './pages/CleaningPipelineEditor';
import ProxyPool from './pages/ProxyPool';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/scripts" element={<ScriptList />} />
        <Route path="/scripts/new" element={<ScriptEditor />} />
        <Route path="/scripts/:id" element={<ScriptEditor />} />
        <Route path="/visual-config" element={<VisualConfigList />} />
        <Route path="/visual-config/new" element={<VisualConfigEditor />} />
        <Route path="/visual-config/:id" element={<VisualConfigEditor />} />
        <Route path="/debug" element={<Debugger />} />
        <Route path="/debug/:scriptId" element={<Debugger />} />
        <Route path="/tasks" element={<TaskList />} />
        <Route path="/tasks/new" element={<TaskEditor />} />
        <Route path="/tasks/:id" element={<TaskEditor />} />
        <Route path="/results" element={<Results />} />
        <Route path="/cleaning" element={<CleaningPipelineList />} />
        <Route path="/cleaning/new" element={<CleaningPipelineEditor />} />
        <Route path="/cleaning/:id" element={<CleaningPipelineEditor />} />
        <Route path="/proxies" element={<ProxyPool />} />
      </Routes>
    </Layout>
  );
}

export default App;
