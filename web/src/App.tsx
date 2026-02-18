import { BrowserRouter, Routes, Route } from "react-router-dom";
import EventPage from "./pages/EventPage";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/event/:eventRoomId" element={<EventPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
