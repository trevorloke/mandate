// Routes + auth gate. Real URLs are the point: every screen, form-open state,
// selected door, and preselected donor lives in the address bar. Screens past
// Today load on demand — the map (Leaflet) is the heaviest and phones in the
// field shouldn't pay for it until they open it.
// Desk-only screens sit under one role guard: a volunteer who types one of
// those URLs lands back on Today (the server refuses their data anyway).
import { lazy } from 'react';
import { Routes, Route, Navigate, Outlet, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from './api.js';
import Shell, { isDesk } from './Shell.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Today from './pages/Today.jsx';
const MapPage = lazy(() => import('./pages/Map.jsx'));
const People = lazy(() => import('./pages/People.jsx'));
const Person = lazy(() => import('./pages/Person.jsx'));
const Shifts = lazy(() => import('./pages/Shifts.jsx'));
const Money = lazy(() => import('./pages/Money.jsx'));
const Signs = lazy(() => import('./pages/Signs.jsx'));
const Outreach = lazy(() => import('./pages/Outreach.jsx'));
const Filings = lazy(() => import('./pages/Filings.jsx'));
const Team = lazy(() => import('./pages/Team.jsx'));
const ImportPeople = lazy(() => import('./pages/ImportPeople.jsx'));
const Turfs = lazy(() => import('./pages/Turfs.jsx'));
const Receipts = lazy(() => import('./pages/Receipts.jsx'));
const ReceiptsOne = lazy(() => import('./pages/ReceiptsOne.jsx'));
import Join from './pages/Join.jsx';

function RequireAuth() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet('/auth/me'),
    retry: false,
    staleTime: 60_000,
  });
  if (me.isLoading) return null;
  if (me.isError) return <Navigate to="/login" replace />;
  return <Shell me={me.data} />;
}

// Staff, treasurers and managers only. The Shell's outlet context is passed
// straight through, so pages keep reading { me } from useOutletContext().
function DeskOnly() {
  const ctx = useOutletContext();
  if (!isDesk(ctx?.me)) return <Navigate to="/" replace />;
  return <Outlet context={ctx} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/join/:token" element={<Join />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Today />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/calls" element={<People key="calls" mode="calls" />} />
        <Route path="/people" element={<People />} />
        <Route path="/people/:id" element={<Person />} />
        <Route path="/shifts" element={<Shifts />} />
        <Route path="/shifts/:id" element={<Shifts />} />
        <Route path="/turfs" element={<Turfs />} />
        <Route path="/turfs/:id" element={<Turfs />} />
        {/* Volunteers get the sign crew's "Signs to put up" view. */}
        <Route path="/signs" element={<Signs />} />
        <Route element={<DeskOnly />}>
          <Route path="/people/import" element={<ImportPeople />} />
          <Route path="/money" element={<Money />} />
          <Route path="/money/receipts" element={<Receipts />} />
          <Route path="/money/receipts/:id" element={<ReceiptsOne />} />
          <Route path="/outreach" element={<Outreach />} />
          <Route path="/outreach/:tab" element={<Outreach />} />
          <Route path="/filings" element={<Filings />} />
          <Route path="/team" element={<Team />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
