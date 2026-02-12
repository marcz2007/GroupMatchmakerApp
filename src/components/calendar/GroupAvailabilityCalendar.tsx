import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
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
  date: Date;
  allFree: boolean;
  someAvailable: boolean;
  busyMembers: string[];
}

export const GroupAvailabilityCalendar: React.FC<Props> = ({ groupId }) => {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [busyTimes, setBusyTimes] = useState<BusyTime[]>([]);
  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch group member user_ids
      const { data: memberRows, error: memberError } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId);

      if (memberError) {
        console.error("Error fetching members:", memberError);
        return;
      }

      const memberIds = (memberRows || []).map((m: { user_id: string }) => m.user_id);

      // Fetch profiles for those members
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, username, avatar_url")
        .in("id", memberIds);

      if (profileError) {
        console.error("Error fetching profiles:", profileError);
        return;
      }

      // Map to GroupMember format
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

      // Fetch busy times for all members for the next 30 days
      const now = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);

      const { data: busyData, error: busyError } = await supabase
        .from("calendar_busy_times")
        .select("user_id, start_time, end_time")
        .in("user_id", memberIds)
        .gte("start_time", now.toISOString())
        .lte("end_time", endDate.toISOString());

      if (busyError) {
        console.error("Error fetching busy times:", busyError);
        return;
      }

      setBusyTimes(busyData || []);

      // Calculate availability for each day
      const days: DayAvailability[] = [];
      for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        date.setHours(0, 0, 0, 0);

        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);

        // Find which members are busy on this day
        const busyMemberIds = new Set<string>();
        (busyData || []).forEach((busy: BusyTime) => {
          const busyStart = new Date(busy.start_time);
          const busyEnd = new Date(busy.end_time);

          // Check if busy period overlaps with this day (during working hours 9am-6pm)
          const dayStart = new Date(date);
          dayStart.setHours(9, 0, 0, 0);
          const dayEnd = new Date(date);
          dayEnd.setHours(18, 0, 0, 0);

          if (busyStart < dayEnd && busyEnd > dayStart) {
            busyMemberIds.add(busy.user_id);
          }
        });

        days.push({
          date,
          allFree: busyMemberIds.size === 0,
          someAvailable: busyMemberIds.size < memberIds.length,
          busyMembers: Array.from(busyMemberIds),
        });
      }

      setAvailability(days);
    } catch (error) {
      console.error("Error fetching availability:", error);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const getDayLabel = (date: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days[date.getDay()];
  };

  const getDateNumber = (date: Date) => {
    return date.getDate();
  };

  const getMemberName = (userId: string) => {
    const member = members.find((m) => m.user_id === userId);
    if (!member?.profiles) return "Unknown";
    const profile = member.profiles;
    if (profile.first_name) {
      return profile.first_name;
    }
    return profile.username || "Unknown";
  };

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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.calendarScroll}
      >
        <View style={styles.daysContainer}>
          {availability.map((day, index) => {
            const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
            const busyRatio = day.busyMembers.length / members.length;

            let bgColor = colors.success; // All free
            if (busyRatio > 0.5) {
              bgColor = colors.error; // Most busy
            } else if (busyRatio > 0) {
              bgColor = colors.warning; // Some busy
            }

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dayCell,
                  { backgroundColor: bgColor },
                  isWeekend && styles.weekendCell,
                  selectedDate?.getTime() === day.date.getTime() &&
                    styles.selectedCell,
                ]}
                onPress={() => setSelectedDate(day.date)}
              >
                <Text style={styles.dayLabel}>{getDayLabel(day.date)}</Text>
                <Text style={styles.dateNumber}>{getDateNumber(day.date)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {selectedDate && (
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>{formatDate(selectedDate)}</Text>
          {availability.find(
            (d) => d.date.getTime() === selectedDate.getTime()
          )?.busyMembers.length === 0 ? (
            <Text style={styles.allFreeText}>
              Everyone is free on this day!
            </Text>
          ) : (
            <View>
              <Text style={styles.busyLabel}>Busy members:</Text>
              {availability
                .find((d) => d.date.getTime() === selectedDate.getTime())
                ?.busyMembers.map((userId) => (
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
  calendarScroll: {
    marginBottom: spacing.md,
  },
  daysContainer: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  dayCell: {
    width: 50,
    height: 60,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
  },
  weekendCell: {
    opacity: 0.7,
  },
  selectedCell: {
    borderWidth: 3,
    borderColor: colors.white,
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.white,
    textTransform: "uppercase",
  },
  dateNumber: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.white,
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
