import { useAuth } from './context/AuthContext.jsx';
import Login from './components/Login/Login.jsx';
import Dashboard from './components/Dashboard/Dashboard.jsx';
import InstallHint from './components/InstallHint/InstallHint.jsx';

export default function App() {
  const { userKey, loading } = useAuth();
  if (loading) return null;
  return (
    <>
      {userKey ? <Dashboard /> : <Login />}
      <InstallHint />
    </>
  );
}
