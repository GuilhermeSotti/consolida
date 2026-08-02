import { redirect } from 'next/navigation';
import { getStoredAuthToken } from './lib/api';

export default function HomePage() {
  redirect(getStoredAuthToken() ? '/dashboard' : '/login');
}
