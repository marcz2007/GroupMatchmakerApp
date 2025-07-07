import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { RootStackNavigationProp } from "../../App";
import { RootStackParamList } from "../navigation/AppNavigator";
import {
  findGroupsByActivity,
  findGroupsByEvent,
  Group,
} from "../utils/matchmaking";

// Define route params type
type MatchResultsRouteProp = RouteProp<RootStackParamList, "MatchResults">;
type MatchResultsNavigationProp = RootStackNavigationProp<"MatchResults">;

// Define the match result item
interface MatchResult {
  group: Group;
  score: number;
}

const MatchResultsScreen = () => {
  const route = useRoute<MatchResultsRouteProp>();
  const navigation = useNavigation<MatchResultsNavigationProp>();
  const { type, query, currentGroupId } = route.params;

  const [results, setResults] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set the screen title based on the search type
    navigation.setOptions({
      title: type === "activity" ? "Activity Matches" : "Event Matches",
    });

    // Fetch results based on the search type
    const fetchResults = async () => {
      setLoading(true);
      try {
        if (type === "activity") {
          const matches = await findGroupsByActivity(query, currentGroupId);
          setResults(matches);
        } else {
          // type === 'event'
          const matches = await findGroupsByEvent(query, currentGroupId);
          setResults(matches);
        }
      } catch (error) {
        console.error("Error fetching match results:", error);
        Alert.alert("Error", "Could not load matching groups.");
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [type, query, currentGroupId, navigation]);

  // Function to handle pressing a group
  const handleGroupPress = (group: Group) => {
    // Here you would navigate to a detailed view of the group
    Alert.alert("Group Selected", `You selected ${group.name}`);
    // In the future: navigation.navigate('GroupDetail', { groupId: group.id });
  };

  // Render a match result item
  const renderMatchItem = ({ item }: { item: MatchResult }) => {
    const matchPercentage = Math.round(item.score * 100);

    return (
      <TouchableOpacity
        style={styles.matchItem}
        onPress={() => handleGroupPress(item.group)}
      >
        <View style={styles.matchHeader}>
          <Image
            source={{
              uri: item.group.photo_url || "https://via.placeholder.com/100",
            }}
            style={styles.groupImage}
          />
          <View style={styles.matchInfo}>
            <Text style={styles.groupName}>{item.group.name}</Text>
            <Text style={styles.matchScore}>{matchPercentage}% Match</Text>
          </View>
        </View>

        <Text style={styles.groupDescription} numberOfLines={2}>
          {item.group.description}
        </Text>

        {item.group.interests && item.group.interests.length > 0 && (
          <View style={styles.interestsContainer}>
            <Text style={styles.interestsLabel}>Interests:</Text>
            <Text style={styles.interestsText}>
              {item.group.interests.join(", ")}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.searchInfo}>
        Results for: <Text style={styles.queryText}>"{query}"</Text>
      </Text>

      {results.length === 0 ? (
        <View style={styles.noResults}>
          <Text style={styles.noResultsText}>No matching groups found</Text>
          <Text style={styles.noResultsTip}>
            Try different search terms or create a new group!
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          renderItem={renderMatchItem}
          keyExtractor={(item) => item.group.id}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#1a1a1a", // Anthracite grey background
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a", // Anthracite grey background
  },
  searchInfo: {
    fontSize: 16,
    marginBottom: 16,
    color: "#e0e0e0", // Light grey text
  },
  queryText: {
    fontWeight: "bold",
    color: "#ffffff", // White text
  },
  list: {
    paddingBottom: 20,
  },
  matchItem: {
    backgroundColor: "#2a2a2a", // Dark surface
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  matchHeader: {
    flexDirection: "row",
    marginBottom: 12,
  },
  groupImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
  },
  matchInfo: {
    flex: 1,
    justifyContent: "center",
  },
  groupName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
    color: "#ffffff", // White text
  },
  matchScore: {
    fontSize: 14,
    color: "#5762b7", // Primary color
    fontWeight: "bold",
  },
  groupDescription: {
    fontSize: 14,
    color: "#e0e0e0", // Light grey text
    marginBottom: 12,
  },
  interestsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  interestsLabel: {
    fontSize: 14,
    fontWeight: "bold",
    marginRight: 6,
    color: "#ffffff", // White text
  },
  interestsText: {
    fontSize: 14,
    color: "#b0b0b0", // Medium grey text
    flex: 1,
  },
  noResults: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 50,
  },
  noResultsText: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#ffffff", // White text
  },
  noResultsTip: {
    fontSize: 14,
    color: "#b0b0b0", // Medium grey text
    textAlign: "center",
    paddingHorizontal: 40,
  },
});

export default MatchResultsScreen;
