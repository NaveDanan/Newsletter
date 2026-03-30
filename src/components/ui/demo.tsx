"use client";

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";

export default function CalendarDefault() {
  const [date, setDate] = useState<Date | undefined>(new Date());

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-8">
      <Calendar mode="single" selected={date} onSelect={setDate} />
    </div>
  );
}
