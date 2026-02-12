import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { supabase } from "../../supabase";
import { colors, spacing } from "../../theme";

interface BusyTime {
  user_id: string;
  start_time: string;
  end_time: string;
}

interface GroupMember {
  user_id: string;
  profiles: {
    first_name: string;
    last_name: string;
    username: string;
    avatar_url: string;
  };
}

interface Props {
  groupId: string;
}

interface DayAvailability {
  dateString: string;
  allFree: boolean;
  someAvailable: boolean;
  busyMembers: string[];
}

function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getInitialMonth(): string {
  const now = new Date();
  return getMonthKey(now.getFullYear(), now.getMonth() + 1);
}

export const GroupAvailabilityCalendar: React.FC<Props> = ({ groupId }) => {
  const [loading, setLoading] = useState(true);
  const [monthLoading, setMonthLoading] = useState(false);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [busyTimes, setBusyTimes] = useState<BusyTime[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(getInitialMonth);
  const busyCache = useRef<Record<string, BusyTime[]>>({});

  // Fetch group members once on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: memberRows, error: memberError } = await supabase
          .from("group_members")
          .select("user_id")
          .eq("group_id", groupId);

        if (memberError) {
          console.error("Error fetching members:", memberError);
          return;
        }

        const ids = (memberRows || []).map((m: { user_id: string }) => m.user_id);

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, username, avatar_url")
          .in("id", ids);

        if (profileError) {
          console.error("Error fetching profiles:", profileError);
          return;
        }

        const mappedMembers: GroupMember[] = (profileData || []).map((p: any) => ({
          user_id: p.id,
          profiles: {
            first_name: p.first_name,
            last_name: p.last_name,
            username: p.username,
            avatar_url: p.avatar_url,
          },
        }));

        setMembers(mappedMembers);
        setMemberIds(ids);
      } catch (error) {
        console.error("Error fetching members:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [groupId]);

  // Fetch busy times for the visible month
  const fetchMonthData = useCallback(
    async (monthKey: string) => {
      if (memberIds.length === 0) return;

      // Use cache if available
      if (busyCache.current[monthKey]) {
        setBusyTimes(busyCache.current[monthKey]);
        return;
      }

      setMonthLoading(true);
      try {
        const [year, month] = monthKey.split("-").map(Number);
        const startOfMonth = new Date(year, month - 1, 1);
        const endOfMonth = new Date(year, month, 1);

        // Fetch events that overlap with this month
        const { data, error } = await supabase
          .from("calendar_busy_times")
          .select("user_id, start_time, end_time")
          .in("user_id", memberIds)
          .lt("start_time", endOfMonth.toISOString())
          .gt("end_time", startOfMonth.toISOString());

        if (error) {
          console.error("Error fetching busy times:", error);
          return;
        }

        const result = data || [];
        busyCache.current[monthKey] = result;
        setBusyTimes(result);
      } catch (error) {
        console.error("Error fetching month data:", error);
      } finally {
        setMonthLoading(false);
      }
    },
    [memberIds]
  );

  // Re-fetch when month or members change
  useEffect(() => {
    fetchMonthData(currentMonth);
  }, [currentMonth, fetchMonthData]);

  const getMemberName = (userId: string) => {
    const member = members.find((m) => m.user_id === userId);
    if (!member?.profiles) return "Unknown";
    const profile = member.profiles;
    if (profile.first_name) {
      return profile.first_name;
    }
    return profile.username || "Unknown";
  };

  // Calculate availability for each day in the visible month
  const availability = useMemo(() => {
    const [year, month] = currentMonth.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const days: DayAvailability[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateString = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const date = new Date(year, month - 1, d);

      const busyMemberIds = new Set<string>();
      busyTimes.forEach((busy) => {
        const busyStart = new Date(busy.start_time);
        const busyEnd = new Date(busy.end_time);

        const dayStart = new Date(date);
        dayStart.setHours(9, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(18, 0, 0, 0);

        if (busyStart < dayEnd && busyEnd > dayStart) {
          busyMemberIds.add(busy.user_id);
        }
      });

      days.push({
        dateString,
        allFree: busyMemberIds.size === 0,
        someAvailable: busyMemberIds.size < memberIds.length,
        busyMembers: Array.from(busyMemberIds),
      });
    }

    return days;
  }, [busyTimes, memberIds, currentMonth]);

  // Build markedDates object for react-native-calendars
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    availability.forEach((day) => {
      const busyRatio = members.length > 0 ? day.busyMembers.length / members.length : 0;

      let dotColor = colors.success;
      if (busyRatio > 0.5) {
        dotColor = colors.error;
      } else if (busyRatio > 0) {
        dotColor = colors.warning;
      }

      marks[day.dateString] = {
        marked: true,
        dotColor,
      };
    });

    if (selectedDate && marks[selectedDate]) {
      marks[selectedDate] = {
        ...marks[selectedDate],
        selected: true,
        selectedColor: colors.primary,
      };
    } else if (selectedDate) {
      marks[selectedDate] = {
        selected: true,
        selectedColor: colors.primary,
      };
    }

    return marks;
  }, [availability, members, selectedDate]);

  const selectedDayInfo = useMemo(() => {
    if (!selectedDate) return null;
    return availability.find((d) => d.dateString === selectedDate) || null;
  }, [availability, selectedDate]);

  const formatSelectedDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const handleMonthChange = useCallback((month: DateData) => {
    setCurrentMonth(getMonthKey(month.year, month.month));
    setSelectedDate(null);
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading availability...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Group Availability</Text>
      <Text style={styles.subtitle}>
        Green = everyone free, Yellow = some busy, Red = most busy
      </Text>

      <View>
        <Calendar
          onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
          onMonthChange={handleMonthChange}
          markedDates={markedDates}
          theme={{
            backgroundColor: colors.surface,
            calendarBackground: colors.surface,
            textSectionTitleColor: colors.text.tertiary,
            selectedDayBackgroundColor: colors.primary,
            selectedDayTextColor: colors.white,
            todayTextColor: colors.primary,
            dayTextColor: colors.text.primary,
            textDisabledColor: colors.disabled,
            dotColor: colors.success,
            selectedDotColor: colors.white,
            arrowColor: colors.primary,
            monthTextColor: colors.text.primary,
            textDayFontWeight: "400",
            textMonthFontWeight: "bold",
            textDayHeaderFontWeight: "600",
            textDayFontSize: 14,
            textMonthFontSize: 16,
            textDayHeaderFontSize: 12,
          }}
          style={styles.calendar}
        />
        {monthLoading && (
          <View style={styles.monthLoadingOverlay}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}
      </View>

      {selectedDate && selectedDayInfo && (
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>{formatSelectedDate(selectedDate)}</Text>
          {selectedDayInfo.busyMembers.length === 0 ? (
            <Text style={styles.allFreeText}>
              Everyone is free on this day!
            </Text>
          ) : (
            <View>
              <Text style={styles.busyLabel}>Busy members:</Text>
              {selectedDayInfo.busyMembers.map((userId) => (
                <Text key={userId} style={styles.busyMemberName}>
                  • {getMemberName(userId)}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={styles.legendContainer}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={styles.legendText}>All free</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
          <Text style={styles.legendText}>Some busy</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
          <Text style={styles.legendText}>Most busy</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    marginVertical: spacing.md,
  },
  loadingContainer: {
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.text.secondary,
    fontSize: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginBottom: spacing.md,
  },
  calendar: {
    borderRadius: 12,
    marginBottom: spacing.md,
  },
  monthLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(42, 42, 42, 0.5)",
    borderRadius: 12,
  },
  detailsCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  allFreeText: {
    fontSize: 14,
    color: colors.success,
    fontWeight: "500",
  },
  busyLabel: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  busyMemberName: {
    fontSize: 14,
    color: colors.text.tertiary,
    marginLeft: spacing.xs,
  },
  legendContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
});

export default GroupAvailabilityCalendar;
