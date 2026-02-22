import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import EventsListScreen from "../EventsListScreen";
import EventChatScreen from "../EventChatScreen";
import EmptyDetailView from "../../components/web/EmptyDetailView";
import { colors } from "../../theme";

const EventsDesktopView = () => {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      <View style={styles.listPanel}>
        <EventsListScreen
          onSelectEvent={setSelectedEventId}
          selectedEventId={selectedEventId}
        />
      </View>
      <View style={styles.detailPanel}>
        {selectedEventId ? (
          <EventChatScreen
            eventRoomIdProp={selectedEventId}
            isDesktopPane
          />
        ) : (
          <EmptyDetailView message="Select an event to open chat" />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
  },
  listPanel: {
    width: 350,
    borderRightWidth: 1,
    borderRightColor: colors.divider,
  },
  detailPanel: {
    flex: 1,
  },
});

export default EventsDesktopView;
