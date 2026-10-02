import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminGate } from './components/AdminGate';
import { Shell } from './components/Shell';
import { AdminPresenterPage } from './pages/AdminPresenterPage';
import { PrototypesPage } from './pages/PrototypesPage';
import { SharePage } from './pages/SharePage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/prototype" replace />} />
      <Route
        path="/prototype"
        element={
          <Shell>
            <AdminGate>{() => <PrototypesPage />}</AdminGate>
          </Shell>
        }
      />
      <Route path="/prototype/:id" element={<AdminGate>{(config) => <AdminPresenterPage config={config} />}</AdminGate>} />
      <Route path="/p/:token" element={<SharePage />} />
      <Route path="*" element={<Navigate to="/prototype" replace />} />
    </Routes>
  );
}
