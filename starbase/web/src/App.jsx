// Routes + auth gate. Real URLs are the point: every screen, form-open state,
// selected door, and preselected donor lives in the address bar. Screens past
// Today load on demand — the map (Leaflet) is the heaviest and phones in the
// field shouldn't pay for it until they open it.
import { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from './api.js';
import Shell from './Shell.jsx';
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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/join/:token" element={<Join />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Today />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/people" element={<People />} />
        <Route path="/people/:id" element={<Person />} />
        <Route path="/shifts" element={<Shifts />} />
        <Route path="/shifts/:id" element={<Shifts />} />
        <Route path="/money" element={<Money />} />
        <Route path="/signs" element={<Signs />} />
        <Route path="/outreach" element={<Outreach />} />
        <Route path="/outreach/:tab" element={<Outreach />} />
        <Route path="/filings" element={<Filings />} />
        <Route path="/team" element={<Team />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
