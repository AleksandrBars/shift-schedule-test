import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { UserProfile } from './types';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    // 1. Ищем в employees
    let { data: empData, error: empError } = await supabase
      .from('employees')
      .select('id, full_name, age, access_level')
      .eq('auth_uid', user.id)
      .single();

    if (empData) {
      setProfile(empData as UserProfile);
      setLoading(false);
      return;
    }

    // 2. Если нет — ищем в admins
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('id, full_name, access_level')
      .eq('auth_uid', user.id)
      .single();

    if (adminData) {
      // Преобразуем в формат UserProfile
      const profileFromAdmin: UserProfile = {
        id: adminData.id,
        full_name: adminData.full_name,
        age: null,          // у админов может не быть возраста
        access_level: adminData.access_level,
      };
      setProfile(profileFromAdmin);
    } else {
      console.error('Profile not found in employees or admins');
      setProfile(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProfile();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600 h-10 w-10" />
      </div>
    );
  }

  if (!profile) {
    return <Auth onLogin={fetchProfile} />;
  }

  return <Dashboard profile={profile} onLogout={handleLogout} />;
}
