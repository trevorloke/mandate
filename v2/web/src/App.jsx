// Routes + auth gate. Real URLs are the point: every screen, form-open state,
// and preselected donor lives in the address bar.
import { Routes, Route, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from './api.js';
import Shell from './Shell.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Today from './pages/Today.jsx';
import People from './pages/People.jsx';
import Person from './pages/Person.jsx';
import Money from './pages/Money.jsx';
import Filings from './pages/Filings.jsx';

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
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Today />} />
        <Route path="/people" element={<People />} />
        <Route path="/people/:id" element={<Person />} />
        <Route path="/money" element={<Money />} />
        <Route path="/filings" element={<Filings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
