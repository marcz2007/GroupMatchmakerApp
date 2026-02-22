import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  Platform,
  SafeAreaView,
  KeyboardAvoidingView,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import { GOOGLE_PLACES_API_KEY } from "@env";
import { colors, spacing, borderRadius } from "../../theme";

interface DetailChipsProps {
  date: Date | null;
  time: Date | null;
  location: string;
  onDateChange: (date: Date | null) => void;
  onTimeChange: (time: Date | null) => void;
  onLocationChange: (location: string) => void;
  minimumDate?: Date;
}

export const DetailChips: React.FC<DetailChipsProps> = ({
  date,
  time,
  location,
  onDateChange,
  onTimeChange,
  onLocationChange,
  minimumDate,
}) => {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);

  // Temp values for pickers - allows "Done" to work without changing value
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [tempTime, setTempTime] = useState<Date>(new Date());

  const formatDate = (d: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (d.toDateString() === today.toDateString()) {
      return "Today";
    } else if (d.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    }
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (t: Date) => {
    return t.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const openDatePicker = () => {
    setTempDate(date || new Date());
    setShowDatePicker(true);
  };

  const openTimePicker = () => {
    setTempTime(time || new Date());
    setShowTimePicker(true);
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      if (event.type === "set" && selectedDate) {
        onDateChange(selectedDate);
      }
    } else if (selectedDate) {
      setTempDate(selectedDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === "android") {
      setShowTimePicker(false);
      if (event.type === "set" && selectedTime) {
        onTimeChange(selectedTime);
      }
    } else if (selectedTime) {
      setTempTime(selectedTime);
    }
  };

  const handleDateDone = () => {
    onDateChange(tempDate);
    setShowDatePicker(false);
  };

  const handleTimeDone = () => {
    onTimeChange(tempTime);
    setShowTimePicker(false);
  };

  const clearDate = () => onDateChange(null);
  const clearTime = () => onTimeChange(null);
  const clearLocation = () => onLocationChange("");

  return (
    <View style={styles.container}>
      {/* Date Chip */}
      <TouchableOpacity
        style={[styles.chip, date && styles.chipFilled]}
        onPress={openDatePicker}
        activeOpacity={0.7}
      >
        <Text style={styles.chipIcon}>📅</Text>
        <Text style={[styles.chipText, date && styles.chipTextFilled]}>
          {date ? formatDate(date) : "Add date"}
        </Text>
        {date && (
          <TouchableOpacity onPress={clearDate} style={styles.clearButton}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Time Chip */}
      <TouchableOpacity
        style={[styles.chip, time && styles.chipFilled]}
        onPress={openTimePicker}
        activeOpacity={0.7}
      >
        <Text style={styles.chipIcon}>🕐</Text>
        <Text style={[styles.chipText, time && styles.chipTextFilled]}>
          {time ? formatTime(time) : "Add time"}
        </Text>
        {time && (
          <TouchableOpacity onPress={clearTime} style={styles.clearButton}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Location Chip */}
      <TouchableOpacity
        style={[styles.chip, styles.chipWide, location && styles.chipFilled]}
        onPress={() => setShowLocationModal(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.chipIcon}>📍</Text>
        <Text
          style={[styles.chipText, location && styles.chipTextFilled]}
          numberOfLines={1}
        >
          {location || "Add location"}
        </Text>
        {location && (
          <TouchableOpacity onPress={clearLocation} style={styles.clearButton}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* iOS Date Picker Modal */}
      {Platform.OS === "ios" && showDatePicker && (
        <Modal transparent animationType="slide">
          <View style={styles.pickerModal}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>Select Date</Text>
                <TouchableOpacity onPress={handleDateDone}>
                  <Text style={styles.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                minimumDate={minimumDate || new Date()}
                textColor={colors.text.primary}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Android Date Picker */}
      {Platform.OS === "android" && showDatePicker && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display="default"
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}

      {/* iOS Time Picker Modal */}
      {Platform.OS === "ios" && showTimePicker && (
        <Modal transparent animationType="slide">
          <View style={styles.pickerModal}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>Select Time</Text>
                <TouchableOpacity onPress={handleTimeDone}>
                  <Text style={styles.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempTime}
                mode="time"
                display="spinner"
                onChange={handleTimeChange}
                textColor={colors.text.primary}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Android Time Picker */}
      {Platform.OS === "android" && showTimePicker && (
        <DateTimePicker
          value={tempTime}
          mode="time"
          display="default"
          onChange={handleTimeChange}
        />
      )}

      {/* Location Modal */}
      <Modal
        visible={showLocationModal}
        animationType="slide"
        onRequestClose={() => setShowLocationModal(false)}
      >
        <SafeAreaView style={styles.locationModalContainer}>
          <View style={styles.locationHeader}>
            <TouchableOpacity onPress={() => setShowLocationModal(false)}>
              <Text style={styles.pickerCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>Location</Text>
            <View style={{ width: 50 }} />
          </View>
          <KeyboardAvoidingView
            style={styles.locationContent}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <GooglePlacesAutocomplete
              placeholder="Search for a place..."
              onPress={(data) => {
                onLocationChange(data.description);
                setShowLocationModal(false);
              }}
              query={{
                key: GOOGLE_PLACES_API_KEY,
                language: "en",
              }}
              fetchDetails={false}
              enablePoweredByContainer={false}
              debounce={300}
              minLength={2}
              keyboardShouldPersistTaps="handled"
              textInputProps={{
                autoFocus: true,
                placeholderTextColor: colors.text.tertiary,
              }}
              styles={{
                container: {
                  flex: 1,
                  backgroundColor: colors.surface,
                },
                textInputContainer: {
                  backgroundColor: colors.surface,
                  paddingHorizontal: spacing.lg,
                  paddingTop: spacing.md,
                },
                textInput: {
                  backgroundColor: colors.surfaceLight,
                  borderRadius: borderRadius.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  fontSize: 16,
                  color: colors.text.primary,
                  height: 48,
                },
                listView: {
                  backgroundColor: colors.surface,
                  paddingHorizontal: spacing.lg,
                },
                row: {
                  backgroundColor: colors.surface,
                  paddingVertical: spacing.md,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                },
                description: {
                  color: colors.text.primary,
                  fontSize: 15,
                },
                separator: {
                  height: 0,
                },
              }}
            />
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderStyle: "dashed",
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  chipFilled: {
    backgroundColor: "rgba(87, 98, 183, 0.2)",
    borderColor: "rgba(87, 98, 183, 0.4)",
    borderStyle: "solid",
  },
  chipWide: {
    minWidth: 170,
  },
  chipIcon: {
    fontSize: 18,
  },
  chipText: {
    fontSize: 17,
    color: colors.text.tertiary,
  },
  chipTextFilled: {
    color: colors.text.primary,
    fontWeight: "500",
  },
  clearButton: {
    marginLeft: spacing.xs,
    padding: 4,
  },
  clearText: {
    fontSize: 14,
    color: colors.text.tertiary,
  },
  pickerModal: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  pickerContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    paddingBottom: spacing.xl,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  pickerCancel: {
    fontSize: 16,
    color: colors.text.tertiary,
  },
  pickerDone: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
  },
  locationModalContainer: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  locationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  locationContent: {
    flex: 1,
  },
});
