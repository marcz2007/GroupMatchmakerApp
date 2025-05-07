import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Button,
    FlatList,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { supabase } from '../supabase';

// Define types for route and navigation
type GroupDetailsScreenRouteProp = RouteProp<RootStackParamList, 'GroupDetails'>;
type GroupDetailsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'GroupDetails'>;

// Interface for fetched group details (can be expanded)
interface GroupDetailsData {
    id: string;
    name: string;
    description?: string | null;
    picture_url?: string | null; // Assuming a column for picture URL in 'groups' table
    owner_id?: string;
}

// Interface for group members
interface GroupMember {
    id: string; // user_id from profiles
    username: string;
    avatar_url?: string | null;
}

const GroupDetailsScreen = () => {
    const route = useRoute<GroupDetailsScreenRouteProp>();
    const navigation = useNavigation<GroupDetailsScreenNavigationProp>();
    const { groupId, groupName: initialGroupName } = route.params;

    const [groupDetails, setGroupDetails] = useState<GroupDetailsData | null>(null);
    const [members, setMembers] = useState<GroupMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // State for bio editing
    const [isEditingBio, setIsEditingBio] = useState(false);
    const [editableBio, setEditableBio] = useState('');
    const [isSavingBio, setIsSavingBio] = useState(false);

    useEffect(() => {
        navigation.setOptions({ title: initialGroupName || groupDetails?.name || 'Group Details' });
    }, [navigation, initialGroupName, groupDetails?.name]);

    useEffect(() => {
        const fetchDetails = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // Fetch group-specific details (name, description, picture_url)
                const { data: groupData, error: groupError } = await supabase
                    .from('groups')
                    .select('id, name, description, picture_url, owner_id') // Add/remove fields as needed
                    .eq('id', groupId)
                    .single();

                if (groupError) throw groupError;
                if (!groupData) throw new Error('Group not found.');
                setGroupDetails(groupData);
                setEditableBio(groupData.description || '');
                if (!initialGroupName) { // If initialGroupName wasn't passed, update title
                    navigation.setOptions({ title: groupData.name || 'Group Details'});
                }

                // Fetch group members
                const { data: memberData, error: memberError } = await supabase
                    .from('group_members')
                    .select(`
                        user_id,
                        profiles ( id, username, avatar_url )
                    `)
                    .eq('group_id', groupId);

                if (memberError) throw memberError;
                
                const mappedMembers = memberData?.map(m => {
                    const profileData = m.profiles as any; // Cast to any to access properties
                    if (profileData && typeof profileData === 'object' && profileData.id) {
                        return {
                            id: profileData.id,
                            username: profileData.username,
                            avatar_url: profileData.avatar_url
                        } as GroupMember;
                    }
                    return null;
                }).filter((profile): profile is GroupMember => profile !== null) || [];
                
                setMembers(mappedMembers);

            } catch (err: any) {
                console.error('Failed to fetch group details or members:', err);
                setError(err.message || 'Could not load group information.');
                Alert.alert('Error', err.message || 'Could not load group information.');
            } finally {
                setIsLoading(false);
            }
        };

        if (groupId) {
            fetchDetails();
        }
    }, [groupId, navigation, initialGroupName]);

    const handleEditBio = () => {
        if (groupDetails) {
            setEditableBio(groupDetails.description || '');
        }
        setIsEditingBio(true);
    };

    const handleCancelEditBio = () => {
        setIsEditingBio(false);
        if (groupDetails) { // Reset editableBio to original if cancelled
            setEditableBio(groupDetails.description || '');
        }
    };

    const handleSaveBio = async () => {
        if (!groupDetails) return;
        setIsSavingBio(true);
        try {
            const { data, error: updateError } = await supabase
                .from('groups')
                .update({ description: editableBio.trim() })
                .eq('id', groupId)
                .select()
                .single();

            if (updateError) throw updateError;

            if (data) {
                setGroupDetails(prevDetails => prevDetails ? { ...prevDetails, description: data.description } : null);
                Alert.alert('Success', 'Group description updated.');
            }
            setIsEditingBio(false);
        } catch (err: any) {
            console.error('Failed to save bio:', err);
            Alert.alert('Error', 'Could not save description.');
        } finally {
            setIsSavingBio(false);
        }
    };

    if (isLoading) {
        return <View style={styles.centered}><ActivityIndicator size="large" /></View>;
    }

    if (error || !groupDetails) {
        return <View style={styles.centered}><Text style={styles.errorText}>{error || 'Group data could not be loaded.'}</Text></View>;
    }

    const renderMemberItem = ({ item }: { item: GroupMember }) => (
        <View style={styles.memberItem}>
            {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.memberAvatar} />
            ) : (
                <View style={styles.memberAvatarPlaceholder} />
            )}
            <Text style={styles.memberName}>{item.username}</Text>
        </View>
    );

    return (
        <ScrollView style={styles.container}>
            {/* Group Picture Area */}
            <View style={styles.pictureSection}>
                {groupDetails.picture_url ? (
                    <Image source={{ uri: groupDetails.picture_url }} style={styles.groupImage} resizeMode="cover" />
                ) : (
                    <View style={styles.groupImagePlaceholder}>
                        <Text style={styles.placeholderText}>No Group Picture</Text>
                    </View>
                )}
                {/* Button to change picture - to be implemented */}
                <TouchableOpacity style={styles.actionButton} onPress={() => Alert.alert('TODO', 'Upload picture functionality')}>
                    <Text style={styles.actionButtonText}>Change Picture</Text>
                </TouchableOpacity>
            </View>

            {/* Group Bio/Description Area - Corrected onPress */}
            <View style={styles.bioSection}>
                <Text style={styles.sectionTitle}>Description</Text>
                {isEditingBio ? (
                    <>
                        <TextInput
                            style={[styles.input, styles.bioInput]}
                            value={editableBio}
                            onChangeText={setEditableBio}
                            placeholder="Enter group description..."
                            multiline
                            numberOfLines={4}
                            editable={!isSavingBio}
                        />
                        <View style={styles.bioActionsContainer}>
                            <Button title="Cancel" onPress={handleCancelEditBio} disabled={isSavingBio} color="#FF3B30"/>
                            <Button title={isSavingBio ? "Saving..." : "Save"} onPress={handleSaveBio} disabled={isSavingBio} />
                        </View>
                    </>
                ) : (
                    <>
                        <Text style={styles.bioText}>{groupDetails.description || 'No description provided.'}</Text>
                        <TouchableOpacity style={styles.actionButton} onPress={handleEditBio}>
                            <Text style={styles.actionButtonText}>Edit Description</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>

            {/* Group Members List Area */}
            <View style={styles.membersSection}>
                <Text style={styles.sectionTitle}>Members ({members.length})</Text>
                {members.length > 0 ? (
                    <FlatList
                        data={members}
                        renderItem={renderMemberItem}
                        keyExtractor={(item) => item.id}
                        scrollEnabled={false} // ScrollView handles main scroll
                    />
                ) : (
                    <Text>No members found.</Text>
                )}
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f4f4f8',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorText: {
        color: 'red',
        fontSize: 16,
        textAlign: 'center',
    },
    pictureSection: {
        alignItems: 'center',
        paddingVertical: 20,
        backgroundColor: '#fff',
        marginBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee'
    },
    groupImage: {
        width: 150,
        height: 150,
        borderRadius: 75,
        marginBottom: 15,
    },
    groupImagePlaceholder: {
        width: 150,
        height: 150,
        borderRadius: 75,
        backgroundColor: '#e0e0e0',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 15,
    },
    placeholderText: {
        color: '#777',
    },
    bioSection: {
        padding: 20,
        backgroundColor: '#fff',
        marginBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee'
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
        color: '#333',
    },
    bioText: {
        fontSize: 16,
        lineHeight: 24,
        color: '#555',
        marginBottom: 15,
    },
    input: {
        borderColor: '#ddd',
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 15,
        paddingVertical: 10,
        fontSize: 16,
        backgroundColor: '#fff',
    },
    bioInput: {
        minHeight: 100,
        textAlignVertical: 'top',
        marginBottom: 10,
    },
    bioActionsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 10,
    },
    membersSection: {
        padding: 20,
        backgroundColor: '#fff',
    },
    memberItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    memberAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 15,
        backgroundColor: '#e9e9e9'
    },
    memberAvatarPlaceholder: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 15,
        backgroundColor: '#ccc',
    },
    memberName: {
        fontSize: 16,
        color: '#333',
    },
    actionButton: {
        backgroundColor: '#007AFF',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
        marginTop: 10,
        alignSelf: 'flex-start',
    },
    actionButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    }
});

export default GroupDetailsScreen; 