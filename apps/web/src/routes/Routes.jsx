import { Navigate, Route, Routes } from 'react-router'
import InboxPage from '../components/pages/InboxPage'
import TodayPage from '../components/pages/TodayPage'
import HorizonsPage from '../components/pages/HorizonsPage'
import SettingsPage from '../components/pages/SettingsPage'
import SearchPage from '../components/pages/SearchPage'
import CompletedPage from '../components/pages/CompletedPage'
import CapturePage from '../components/pages/CapturePage'
import SignInPage from '../components/pages/SignInPage'

export default function AppRoutes() {
    return <Routes>
        <Route path="/" element={ <Navigate to="/today" replace /> } />
        <Route path="/capture" element={ <CapturePage /> } />
        <Route path="/inbox" element={ <InboxPage /> } />
        <Route path="/today" element={ <TodayPage /> } />
        <Route path="/horizons" element={ <HorizonsPage /> } />
        <Route path="/search" element={ <SearchPage /> } />
        <Route path="/completed" element={ <CompletedPage /> } />
        <Route path="/settings" element={ <SettingsPage /> } />
        <Route path="/signin" element={ <SignInPage /> } />
        <Route path="*" element={ <Navigate to="/today" replace /> } />
    </Routes>
}
