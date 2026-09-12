import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Switch, Image, Alert, Modal , ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';import { auth, db, storage } from './firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Linking, Share } from 'react-native';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, setDoc, getDocs, where, updateDoc, deleteDoc, arrayUnion, arrayRemove, increment, getDoc, writeBatch } from 'firebase/firestore';

const buildLevels = () => {
  const stages = [
    { name: "Rookie", sub: ["I","II","III","IV"], cost: () => 100 },
    { name: "Silver", sub: ["I","II","III","IV"], cost: (i) => 500 + i*150 },
    { name: "Gold", sub: ["I","II","III","IV"], cost: (i) => 1200 + i*250 },
    { name: "Platinum", sub: ["I","II","III","IV","V","VI","VII","VIII","IX","X"], cost: (i) => 2450 + i*500 },
    { name: "Master", sub: ["1","2","3","4","5","6","7","8"], cost: (i) => 7900 + i*950 },
    { name: "Supremacy", sub: ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII","XIV","XV"], cost: (i) => 16050 + i*1500 },
  ];
  const flat = [];
  let cumulative = 0;
  stages.forEach((stage) => {
    stage.sub.forEach((label, i) => {
      const stepCost = stage.cost(i);
      const from = cumulative;
      cumulative += stepCost;
      flat.push({ stage: stage.name, label, stepCost, from, to: cumulative });
    });
  });
  return flat;
};
const LEVELS = buildLevels();
const MAX_POINTS = LEVELS[LEVELS.length - 1].to;
function getRank(points) {
  const capped = Math.min(Math.max(points, 0), MAX_POINTS);
  let idx = LEVELS.findIndex((l) => capped < l.to);
  if (idx === -1) idx = LEVELS.length - 1;
  return LEVELS[idx];
}

const TERMS_TEXT = `Ascend – Terms & Conditions

1. Eligibility & Accounts
You may create an account using either an email address or a phone number. Ascend is available to users worldwide.

2. Points & Ranks
- Creating a post: +2 points
- Daily login: +40 points
- Missing a full day without logging in: -20 points
- Adding a friend, only once they add you back: +5 points

3. Reporting & Enforcement
If an account is found, after review, to have genuinely violated these terms, that account may face serious consequences, including suspension or a permanent ban. In addition, the violating account loses 60 points, and the reporting account gains 15 points. Reports made in bad faith may result in consequences for the reporting account instead.

4. Prohibited Content
Nudity and sexually explicit content are strictly prohibited on Ascend. Hate speech, slurs, and offensive language directed at people or groups are also prohibited.

5. Enforcement
Ascend reserves the right to take action against accounts that violate these terms, including point deductions, rank resets, suspension, or permanent removal from the platform.

6. Ownership
Ascend is owned and operated by TEAM MIDEON.

By creating an account, you agree to these terms.`;const BLOCKED_WORDS = ['fuck', 'shit', 'bitch', 'asshole']; // basic placeholder filter — real hate-speech/slur detection needs a dedicated moderation service later

const FRIEND_INFO = {
  Ada: { age: 24, location: 'Lagos, Nigeria', bio: 'Coffee, code, repeat.', rank: 'Silver II' },
  Marco: { age: 27, location: 'São Paulo, Brazil', bio: 'Videos and vibes.', rank: 'Gold I' },
  Zainab: { age: 22, location: 'Nairobi, Kenya', bio: 'Climbing the ranks 🏆', rank: 'Rookie III' },
};

function getBotReply(q) {
  const t = q.toLowerCase();
  if (t.includes('nude') || t.includes('naked') || t.includes('nsfw')) return "Nudity and sexually explicit content are strictly prohibited on Ascend. Accounts posting this can face severe punishment, including suspension or a permanent ban.";
  if (t.includes('swear') || t.includes('curse') || t.includes('offensive') || t.includes('slur') || t.includes('hate speech') || t.includes('racist')) return "Hate speech, slurs, and offensive language directed at people or groups aren't allowed on Ascend. This can be reported, and confirmed violations can lead to serious consequences, including a ban.";
  if (t.includes('ban') || t.includes('punish')) return "If an account is found to have truly violated our terms, it can face serious punishment, including suspension or a permanent ban — on top of the usual point penalty.";
  if (t.includes('terms') || t.includes('rule')) return TERMS_TEXT;
  if (t.includes('reel') || t.includes('video')) return "Tap the Reels tab to watch videos people have posted. You can attach your own with the 📎 Photo / Video button on the Feed screen.";
  if (t.includes('voice')) return "Tap the 🎤 button in a chat to send a voice note. Right now it's a placeholder — real audio recording is coming in a future update.";
  if (t.includes('otp') || t.includes('code')) return "When you sign up or reset your password, Ascend sends a one-time code to your email or phone to verify it's really you.";
  if (t.includes('age')) return "Ascend asks for your age when you sign up, as part of keeping the community safe.";
  if (t.includes('where') || t.includes('location') || t.includes('from')) return "You can add where you're from when you sign up, and view it on other people's profiles by tapping their name or photo.";
  if (t.includes('picture') || t.includes('photo') && t.includes('profile')) return "You can add a profile picture during sign up, from the Photo/Video option.";
  if (t.includes('settings')) return "All your account options — dark mode, password reset, terms, and logout — live under Settings on your Profile tab.";
  if (t.includes('point')) return "You earn points by posting (+2), logging in daily (+40), and adding mutual friends (+5). Missing a full day without logging in costs -20.";
  if (t.includes('legendary') || t.includes('legacy')) return "Legendary IV needs top 5000, III needs top 3500, II needs top 2500, and Legendary I — the most exclusive — needs top 1000.";
  if (t.includes('rank') || t.includes('level')) return "Ranks run from Rookie all the way to Supremacy XV, plus Legendary I-IV for the very top of the leaderboard.";
  if (t.includes('report') || t.includes('block')) return "Tap someone's name or photo on a post to open their menu, where you can view their profile, message them, block them, or report them.";
  if (t.includes('password')) return "You can reset your password from Settings, on the Profile tab — you'll get a one-time code by email or phone to confirm it's you.";
  if (t.includes('photo') || t.includes('media')) return "Tap the 📎 Photo / Video button on the Feed screen to attach a picture or video to your post.";
  if (t.includes('dark') || t.includes('theme')) return "You can switch to Dark Mode from Settings, on the Profile tab.";
  if (t.includes('friend')) return "Adding a friend gives you +5 points, but only once they add you back.";
  if (t.includes('owner') || t.includes('who made') || t.includes('who owns')) return "Ascend is owned and operated by TEAM MIDEON.";
  if (t.includes('hi') || t.includes('hello') || t.includes('hey')) return "Hey! I'm the Ascend Help Bot. Ask me about points, ranks, posting, reels, friends, rules, your account, or how anything in the app works.";
  return "I'm still learning! Try asking about points, ranks, posting rules, Legendary ranks, reels, voice notes, account settings, or how OTP verification works.";
}export default function App() {
  const [user, setUser] = useState(null);
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [groupMsgs, setGroupMsgs] = useState([]);
  const [groupJoinRequests, setGroupJoinRequests] = useState([]);
  const [groupMsgDraft, setGroupMsgDraft] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedForGroup, setSelectedForGroup] = useState([]);
  const [groupPrivacy, setGroupPrivacy] = useState('public');
  const [authMode, setAuthMode] = useState('login');
  const [signupStage, setSignupStage] = useState('name');
  const [nameInput, setNameInput] = useState('');
  const [ageInput, setAgeInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [genderInput, setGenderInput] = useState('');
  const [friendInput, setFriendInput] = useState('');
  const [bio, setBio] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [signupPhoto, setSignupPhoto] = useState(null);
  const [signupCode, setSignupCode] = useState('');
  const [codeInput, setCodeInput] = useState('');

  const [screen, setScreen] = useState('feed');
  const [authLoading, setAuthLoading] = useState(false);

  const [createPageOpen, setCreatePageOpen] = useState(false);
  const [pageNameInput, setPageNameInput] = useState('');
  const [pageDescriptionInput, setPageDescriptionInput] = useState('');
  const [pageCategoryInput, setPageCategoryInput] = useState('');
  const [pagePhoto, setPagePhoto] = useState(null);
  const [pages, setPages] = useState([]);
  const [followedPages, setFollowedPages] = useState([]);
  const [pageProfile, setPageProfile] = useState(null);
  
  const [points, setPoints] = useState(0);
  const [lastLoginDate, setLastLoginDate] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  
  const [draft, setDraft] = useState('');
  const [draftMedia, setDraftMedia] = useState(null);
  const [friends, setFriends] = useState([])
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [profileMenuFor, setProfileMenuFor] = useState(null);const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [viewProfileFor, setViewProfileFor] = useState(null);
  const [viewProfileData, setViewProfileData] = useState(null);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [chatDraft, setChatDraft] = useState('');
  const [groupMessages, setGroupMessages] = useState([]);
  const [groupDraft, setGroupDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchCategory, setSearchCategory] = useState('people');
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [realFriends, setRealFriends] = useState([]);
  const [activePrivateFriend, setActivePrivateFriend] = useState(null);
  const [privateMessages, setPrivateMessages] = useState([]);
  const [privateDraft, setPrivateDraft] = useState('');
  const [userPosts, setUserPosts] = useState([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentingPostId, setCommentingPostId] = useState(null);
  const [groupChatOpen, setGroupChatOpen] = useState(false);

  const [aiMessages, setAiMessages] = useState([
    { id: 1, from: 'bot', text: "Hey! I'm the Ascend Help Bot. Ask me about points, ranks, posting, reels, friends, rules, your account, or how anything in the app works." },
  ]);
  const [aiDraft, setAiDraft] = useState('');

  const [editName, setEditName] = useState('');
  const [editNameVisible, setEditNameVisible] = useState(false);

  const bg = darkMode ? '#141119' : '#f0f2ee';
  const cardBg = darkMode ? '#1c1f16' : '#ffffff';
  const text = darkMode ? '#f0f0f0' : '#161b15';
  const subtext = darkMode ? '#9aa393' : '#657160';
  const accent = '#1E8449';
  const border = darkMode ? '#2a3020' : '#e1e8dc';const [appReady, setAppReady] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingDots, setLoadingDots] = useState('.');

  useEffect(() => {
  const interval = setInterval(() => {
    setLoadingDots((dots) =>
      dots === '.' ? '..' : dots === '..' ? '...' : '.'
    );
  }, 500);

  return () => clearInterval(interval);
}, []);
  
  useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
    try {
      if (!firebaseUser) {
        setUser(null);
        return;
      }

      const userQuery = query(
        collection(db, 'users'),
        where('uid', '==', firebaseUser.uid)
      );

      const userSnapshot = await getDocs(userQuery);

      const today = new Date();
      const todayDate = today.toISOString().slice(0, 10);

      const currentEmail = (firebaseUser.email || '').toLowerCase();

      const isAscendOfficial =
  currentEmail === 'ascendofficial18@gmail.com';

      const isPersonalVerified =
  currentEmail === 'adesesanayomide45@gmail.com';

      if (!userSnapshot.empty) {
        const userDoc = userSnapshot.docs[0];
        const userData = userDoc.data();

        const currentPoints = Number(userData.points || 0);
        const lastLogin = userData.lastLoginDate;

        let newPoints = currentPoints;

        if (!lastLogin) {
          newPoints = currentPoints + 40;
        } else if (lastLogin !== todayDate) {
          const previousDate = new Date(lastLogin + 'T00:00:00Z');
          const currentDate = new Date(todayDate + 'T00:00:00Z');

          const daysPassed = Math.floor(
            (currentDate - previousDate) / (1000 * 60 * 60 * 24)
          );

          const missedDays = Math.max(0, daysPassed - 1);

          newPoints = Math.max(
            0,
            currentPoints + 40 - (missedDays * 20)
          );
        }

        await updateDoc(doc(db, 'users', userDoc.id), {
  points: newPoints,
  lastLoginDate: todayDate,
  ...(isAscendOfficial
    ? {
        Verified: true,
        isOfficial: true,
      }
    : isPersonalVerified
    ? {
        Verified: true,
        isOfficial: false,
      }
    : {}),
});

        setPoints(newPoints);

        setUser({
    uid: firebaseUser.uid,
    ...userData,
    email: currentEmail,
    points: newPoints,
    lastLoginDate: todayDate,
    Verified: isAscendOfficial || isPersonalVerified
    ? true
    : userData.Verified === true,
  isOfficial: isAscendOfficial
    ? true
    : userData.isOfficial === true,
});
      } else {
  await setDoc(doc(db, 'users', firebaseUser.uid), {
  uid: firebaseUser.uid,
  name: firebaseUser.displayName || 'User',
  email: currentEmail,
  points: 40,
  lastLoginDate: todayDate,
  Verified: isAscendOfficial || isPersonalVerified,
  isOfficial: isAscendOfficial,
  createdAt: serverTimestamp(),
});

  setUser({
  uid: firebaseUser.uid,
  name: firebaseUser.displayName || 'User',
  email: currentEmail,
  points: 40,
  lastLoginDate: todayDate,
  Verified: isAscendOfficial || isPersonalVerified,
  isOfficial: isAscendOfficial,
});

  setPoints(40);
      }
    } catch (error) {
      console.log('Auth restore error:', error);
      setUser(null);
    } finally {
      setAppReady(true);
    }
  });

  return () => unsubscribe();
}, []);
  
  useEffect(() => {
    if (!user) return;
    setNotifications([{ id: 1, from: 'Ascend', text: `Welcome to Ascend, ${user.name}! We're glad you're here. 🎉`, read: false }]);
  }, [user?.email]);

   useEffect(() => {
  if (!user || !user.uid) return;

  const q = query(
    collection(db, 'notifications'),
    where('recipientUid', '==', user.uid)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const realNotifications = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    setNotifications(realNotifications);
  });

  return () => unsubscribe();
}, [user?.uid]);
  
  useEffect(() => {
    if (!user || !user.uid) return;
    const q = query(collection(db, 'friendRequests'), where('toUid', '==', user.uid), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reqs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setIncomingRequests(reqs);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user || !user.uid) return;
    const q = query(collection(db, 'privateChats'), where('members', 'array-contains', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        const otherUid = data.members.find((m) => m !== user.uid);
        return { chatId: d.id, uid: otherUid, name: data.memberNames[otherUid] };
      });
      setRealFriends(list);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user || !activePrivateFriend) return;
    const chatId = [user.uid, activePrivateFriend.uid].sort().join('_');
    const q = query(collection(db, 'privateChats', chatId, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPrivateMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, [activePrivateFriend, user?.uid]);
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'posts'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUserPosts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, [user?.uid]);useEffect(() => {
    if (!user || !user.uid) return;
    const q = query(collection(db, 'groups'), where('members', 'array-contains', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGroups(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, [user?.uid]);

    useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'pages'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPages(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }))
      );
    });

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
  const createOfficialPage = async () => {
    if (!user?.uid || user.isOfficial !== true) return;

    try {
      const officialPageRef = doc(db, 'pages', user.uid);
      const officialPageSnap = await getDoc(officialPageRef);

      const officialPageData = {
        name: 'Ascend',
        description: 'The official Ascend page.',
        category: 'Social Network',
        ownerUid: user.uid,
        ownerName: 'Ascend',
        photo: user.photo || '',
        Verified: true,
        isOfficial: true,
        followersCount: officialPageSnap.exists()
          ? officialPageSnap.data().followersCount || 0
          : 0,
        createdAt: officialPageSnap.exists()
          ? officialPageSnap.data().createdAt || serverTimestamp()
          : serverTimestamp(),
      };

      await setDoc(officialPageRef, officialPageData, { merge: true });
    } catch (error) {
      console.log('Official page setup failed:', error);
    }
  };

  createOfficialPage();
}, [user?.uid, user?.isOfficial, user?.photo]);

  useEffect(() => {
  if (!user?.uid) return;

  const q = query(
    collection(db, 'follows'),
    where('userUid', '==', user.uid)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    setFollowedPages(
      snapshot.docs.map((d) => d.data().pageId)
    );
  });

  return () => unsubscribe();
}, [user?.uid]);

  useEffect(() => {
    if (!activeGroup) return;
    const q = query(collection(db, 'groups', activeGroup.id, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGroupMsgs(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, [activeGroup]);

  useEffect(() => {
  if (!user?.uid) return;

  const q = query(
    collection(db, 'groupJoinRequests'),
    where('status', '==', 'pending')
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      .filter((request) => request.ownerUid === user.uid);

    setGroupJoinRequests(requests);
  });

  return () => unsubscribe();
}, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'familyChat'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGroupMessages(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user]);

  const rank = getRank(points);
  const idx = LEVELS.findIndex((l) => l === rank);
  const next = LEVELS[idx + 1];
  const activeChat = chats.find((c) => c.id === activeChatId);
  const combinedPosts = userPosts.map((p) => ({
  ...p,
  media: p.hasMedia
    ? {
        uri: p.mediaUrl || null,
        type: p.mediaType,
      }
    : null,
}));
  const visiblePosts = combinedPosts.filter((p) => !blockedUsers.includes(p.author));
  const videoPosts = visiblePosts.filter((p) => p.media && p.media.type === 'video');
  const pickMedia = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow photo access to attach media.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.7 });
    if (!result.canceled) {
      const asset = result.assets[0];
      setDraftMedia({ uri: asset.uri, type: asset.type });
    }
  };

  const pickSignupPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow photo access to add a profile picture.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled) setSignupPhoto(result.assets[0].uri);
  };

  const pickProfileImage = async () => {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!perm.granted) {
      Alert.alert(
        'Permission needed',
        'Please allow photo access to change your profile picture.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (result.canceled) return;

    const imageUri = result.assets[0].uri;

    const response = await fetch(imageUri);
    const blob = await response.blob();

    const fileRef = ref(
      storage,
      `profilePictures/${user.uid}_${Date.now()}`
    );

    await uploadBytes(fileRef, blob);

    const photoUrl = await getDownloadURL(fileRef);

    await updateDoc(doc(db, 'users', user.uid), {
      photo: photoUrl,
    });

    setUser((prev) => ({
      ...prev,
      photo: photoUrl,
    }));

    Alert.alert('Success', 'Your profile picture has been updated!');
  } catch (error) {
    Alert.alert('Profile picture failed', error.message);
  }
};
  
  const toggleLike = async (post) => {
    if (typeof post.id !== 'string') { Alert.alert('Not available yet', 'Liking isn\'t supported on this post yet.'); return; }
    try {
      const liked = (post.likes || []).includes(user.uid);
      await updateDoc(doc(db, 'posts', post.id), { likes: liked ? arrayRemove(user.uid) : arrayUnion(user.uid) });
    } catch (error) { Alert.alert('Failed', error.message); }
  };

  const submitComment = async (post) => {
  if (!commentDraft.trim()) return;

  if (typeof post.id !== 'string') {
    Alert.alert(
      'Comments coming soon',
      'Comments for this Ascend post will be available soon.'
    );
    return;
  }

  try {
    await addDoc(
      collection(db, 'posts', post.id, 'comments'),
      {
        text: commentDraft.trim(),
        author: user.name,
        authorUid: user.uid,
        verified: user.Verified === true,
        timestamp: serverTimestamp(),
      }
    );

    await updateDoc(doc(db, 'posts', post.id), {
      commentCount: increment(1),
    });

    setCommentDraft('');
    setCommentingPostId(null);
  } catch (error) {
    Alert.alert('Failed', error.message);
  }
};

  const sharePost = async (post) => {
    try {
      await Share.share({ message: `${post.author} on Ascend: ${post.text}` });
      if (typeof post.id === 'string') await updateDoc(doc(db, 'posts', post.id), { shareCount: increment(1) });
    } catch (error) {}
  };

 const seedAscendOfficialPosts = async () => {
  if (!user?.uid || user.isOfficial !== true) return;

  try {
    const seedRef = doc(db, 'system', 'ascendOfficialPostsV1');
    const seedSnap = await getDoc(seedRef);

    if (seedSnap.exists() && seedSnap.data()?.seeded === true) {
      return;
    }

    const batch = writeBatch(db);

    const officialPosts = [
      {
        id: 'ascend-official-01',
        text: 'Welcome to Ascend! 🎉 This is a place to connect, share, make friends, follow Pages, join groups, and climb the ranks together.',
      },
      {
        id: 'ascend-official-02',
        text: 'Quick question 😄: If you could give yourself one special superpower on Ascend, what would it be?',
      },
      {
        id: 'ascend-official-03',
        text: 'Daily reminder: consistency matters. Log in, connect with people, post something, and keep climbing. 🚀',
      },
      {
        id: 'ascend-official-04',
        text: 'Ascend joke of the day 😂: I wanted to post something intelligent today… then I remembered I am still loading.',
      },
      {
        id: 'ascend-official-05',
        text: 'Your friends are part of your journey. Send a friend request to someone you know and grow your circle. 🤝',
      },
      {
        id: 'ascend-official-06',
        text: 'Did you know you can follow Pages on Ascend? Find your favourite Pages under the Pages search category.',
      },
      {
        id: 'ascend-official-07',
        text: 'Public or private? 👀 If you created a group, choose the privacy that works best for your community.',
      },
      {
        id: 'ascend-official-08',
        text: 'Never underestimate one small post. Someone might need to see exactly what you decided to share today. ❤️',
      },
      {
        id: 'ascend-official-09',
        text: 'Ascend challenge: make one new friend this week. No pressure, just good vibes. 😎',
      },
      {
        id: 'ascend-official-10',
        text: 'Remember: your profile is yours. Add a profile picture, update your information, and make Ascend feel like home.',
      },
      {
        id: 'ascend-official-11',
        text: 'What makes a great friend? Loyalty, honesty, support, or simply being there when it matters? Tell us your answer.',
      },
      {
        id: 'ascend-official-12',
        text: 'Sometimes the best conversations start with a simple “hello.” 👋',
      },
      {
        id: 'ascend-official-13',
        text: 'Keep going. Your current rank does not have to be your final rank. 💪',
      },
      {
        id: 'ascend-official-14',
        text: 'Ascend joke 😂: My phone asked me if I wanted to save my password. I said, “Of course.” It replied, “Then remember it.” 😭',
      },
      {
        id: 'ascend-official-15',
        text: 'Have something interesting to share? Create a post and let the community see it.',
      },
      {
        id: 'ascend-official-16',
        text: 'Pages are for communities, brands, creators, businesses, and official identities. Create yours and start building followers.',
      },
        {
        id: 'ascend-official-17',
        text: 'A good community is built one person at a time. Thanks for being one of the people helping Ascend grow. ❤️',
      },
      {
        id: 'ascend-official-18',
        text: 'Question of the day: What is the funniest thing that happened to you this week? 😂',
      },
      {
        id: 'ascend-official-19',
        text: 'Take a moment today to check on someone you care about. A simple message can mean a lot.',
      },
      {
        id: 'ascend-official-20',
        text: 'Ascend is just getting started. More features, more communities, and more ways to connect are coming. 🚀',
      },
      {
        id: 'ascend-official-21',
        text: 'If you could rename your current rank, what funny name would you choose? 😂',
      },
      {
        id: 'ascend-official-22',
        text: 'Your next great conversation could be one search away. Find people, Pages, or Groups using Search.',
      },
      {
        id: 'ascend-official-23',
        text: 'Keep your community positive. Treat people with respect and help make Ascend a place people enjoy visiting.',
      },
      {
        id: 'ascend-official-24',
        text: 'Ascend joke 😂: “I will sleep early tonight.” — Famous last words before scrolling for another two hours. 😭',
      },
      {
        id: 'ascend-official-25',
        text: 'Progress does not always happen quickly. Keep showing up and keep moving forward. 🌟',
      },
              {
        id: 'ascend-official-26',
        text: 'You can now discover people, Pages, and Groups from one Search screen. 🔎',
      },
      {
        id: 'ascend-official-27',
        text: 'Ascend joke 😂: I opened the fridge three times hoping new food would appear. It did not. 😭',
      },
      {
        id: 'ascend-official-28',
        text: 'A new day is another chance to make progress. Keep building, keep connecting, and keep climbing. 🚀',
      },
      {
        id: 'ascend-official-29',
        text: 'What kind of group would you create on Ascend: football, gaming, school, business, music, or something completely different?',
      },
      {
        id: 'ascend-official-30',
        text: 'Remember that private groups require approval before someone can become a member. 🔐',
      },
      {
        id: 'ascend-official-31',
        text: 'Public groups are open for people to join directly. Find one that interests you and become part of the community.',
      },
      {
        id: 'ascend-official-32',
        text: 'Good things take time. Your Ascend journey is yours, so focus on improving rather than comparing yourself with everyone else.',
      },
      {
        id: 'ascend-official-33',
        text: 'Ascend joke 😂: “I will only check my notifications for one minute.” Famous last words. 😭',
      },
      {
        id: 'ascend-official-34',
        text: 'Have you discovered a Page you like? Follow it so you can stay connected with its community.',
      },
      {
        id: 'ascend-official-35',
        text: 'Your posts can include photos or videos. Share something that tells the community what you are about.',
      },
      {
        id: 'ascend-official-36',
        text: 'A great conversation does not need a complicated beginning. Sometimes “Hey, how are you?” is enough. 👋',
      },
      {
        id: 'ascend-official-37',
        text: 'Question: If Ascend gave you a free trip anywhere in the world, where would you go? 🌍',
      },
      {
        id: 'ascend-official-38',
        text: 'Keep your passwords private and never share your account credentials with anyone.',
      },
      {
        id: 'ascend-official-39',
        text: 'Ascend is built around real people and real communities. Help us keep the platform respectful and enjoyable.',
      },
      {
        id: 'ascend-official-40',
        text: 'Small achievement today? Celebrate it. Progress is progress. 🎉',
      },
      {
        id: 'ascend-official-41',
        text: 'Ascend joke 😂: My alarm clock and I have a toxic relationship. It keeps waking me up and I keep ignoring it. 😭',
      },
      {
        id: 'ascend-official-42',
        text: 'If you have a business, community, creator identity, or organisation, a Page can help people find and follow you.',
      },
      {
        id: 'ascend-official-43',
        text: 'Friendships grow through communication. Check your chats and keep in touch with the people who matter.',
      },
      {
        id: 'ascend-official-44',
        text: 'What is one thing you want to accomplish before this year ends? Tell someone and make it real. 💪',
      },
      {
        id: 'ascend-official-45',
        text: 'You do not have to be perfect to participate. Share, connect, learn, and enjoy the journey.',
      },
      {
        id: 'ascend-official-46',
        text: 'Ascend joke 😂: I said I was going to be productive today. My bed said, “Let us discuss this first.” 😭',
      },
      {
        id: 'ascend-official-47',
        text: 'Every community starts small. The people here today are part of the beginning of Ascend. ❤️',
      },
      {
        id: 'ascend-official-48',
        text: 'Question of the day: What feature would you love to see added to Ascend in the future?',
      },
      {
        id: 'ascend-official-49',
        text: 'Thank you for being part of Ascend. Keep inviting good people, sharing good energy, and building something great together.',
      },
      {
        id: 'ascend-official-50',
        text: 'This is only the beginning. 🚀 Welcome to Ascend — connect, create, follow, chat, join communities, and keep climbing.',
      },
    ];

    officialPosts.forEach((post) => {
      const postRef = doc(db, 'posts', post.id);

      batch.set(postRef, {
        author: 'Ascend',
        authorUid: user.uid,
        verified: true,
        isOfficial: true,
        text: post.text,
        hasMedia: false,
        mediaType: null,
        mediaUrl: null,
        likes: [],
        commentCount: 0,
        shareCount: 0,
        timestamp: serverTimestamp(),
      });
    });

    batch.set(seedRef, {
      seeded: true,
      version: 1,
      postCount: 50,
      seededAt: serverTimestamp(),
    });

    await batch.commit();

    console.log('50 Ascend official posts seeded successfully.');
  } catch (error) {
    console.log('Ascend official post seeding failed:', error);
  }
};

useEffect(() => {
  if (user?.uid && user.isOfficial === true) {
    seedAscendOfficialPosts();
  }
}, [user?.uid, user?.isOfficial]);

  const addPost = async () => {
    if (!draft.trim() && !draftMedia) return;
    if (BLOCKED_WORDS.some((w) => draft.toLowerCase().includes(w))) {
      Alert.alert('Post blocked', 'Your post contains language that violates our content policy. Please edit it before posting.');
      return;
    }
    try {
      let mediaUrl = null;
      if (draftMedia) {
        const response = await fetch(draftMedia.uri);
        const blob = await response.blob();
        const fileRef = ref(storage, `posts/${user.uid}_${Date.now()}`);
        await uploadBytes(fileRef, blob);
        mediaUrl = await getDownloadURL(fileRef);
      }
      await addDoc(collection(db, 'posts'), {
        author: user.name,
        authorUid: user.uid || null,
        verified: user.Verified === true,
        isOfficial: user.isOfficial === true,
        text: draft,
        hasMedia: !!draftMedia,
        mediaType: draftMedia ? draftMedia.type : null,
        mediaUrl: mediaUrl,
        likes: [],
        commentCount: 0,
        shareCount: 0,
        timestamp: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users', user.uid), {
  points: increment(2),
});
      setPoints(prev => prev + 2);
      setDraft('');
      setDraftMedia(null);
    } catch (error) {
      Alert.alert('Post failed', error.message);
    }
  };
  const addFeeling = () => setDraft((d) => (d ? d + ' 😊' : 'Feeling good 😊'));

  const reportPerson = (name) => {
    setProfileMenuFor(null);
    Alert.alert(
      `Report ${name}?`,
      'If this account is found to have truly violated our Terms and Conditions, it may face serious consequences, including suspension or a permanent ban. The account will also lose 60 points, and you will be credited with 15.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Report', onPress: () => {
            setPoints((p) => p + 15);
            Alert.alert('Report submitted', `${name}'s account has been flagged for review. (Demo: +15 pts credited for this simulated valid report.)`);
          }
        }
      ]
    );
  };

  const blockPerson = (name) => {
    setProfileMenuFor(null);
    Alert.alert(`Block ${name}?`, "You won't see their posts anymore.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => setBlockedUsers((prev) => [...prev, name]) },
    ]);
  };

  const messagePerson = (name) => {
    setProfileMenuFor(null);
    const existing = chats.find((c) => c.name === name);
    if (existing) {
      setActiveChatId(existing.id);
    } else {
      const newChat = { id: Date.now(), name, online: false, messages: [] };
      setChats((prev) => [...prev, newChat]);
      setActiveChatId(newChat.id);
    }
    setScreen('chat');
  };

  const openProfile = async (name) => {
  setProfileMenuFor(null);
  setViewProfileFor(name);
  setViewProfileData(null);

  try {
    const userQuery = query(
      collection(db, 'users'),
      where('name', '==', name)
    );

    const userSnapshot = await getDocs(userQuery);

    if (!userSnapshot.empty) {
      setViewProfileData(userSnapshot.docs[0].data());
    }
  } catch (error) {
    console.log('Profile load error:', error);
  }
};
  
  const sendChatMessage = () => {
    if (!chatDraft.trim() || !activeChatId) return;
    const msgId = Date.now();
    setChats((prev) => prev.map((c) => c.id === activeChatId
      ? { ...c, messages: [...c.messages, { id: msgId, from: 'me', text: chatDraft, read: false }] }
      : c));
    setChatDraft('');
};
    const searchUsers = async () => {
  const term = searchQuery.trim().toLowerCase();

  if (!term) {
    setSearchResults([]);
    return;
  }

  setSearchLoading(true);

  try {
    const snapshot = await getDocs(collection(db, 'users'));

    const results = snapshot.docs
      .map((d) => ({ uid: d.id, ...d.data() }))
      .filter(
        (u) =>
          u.uid !== user.uid &&
          u.isOfficial !== true &&
          typeof u.name === 'string' &&
          u.name.toLowerCase().includes(term)
      );

    setSearchResults(results);
  } catch (error) {
    Alert.alert('Search failed', error.message);
  } finally {
    setSearchLoading(false);
  }
};

  const searchPages = async () => {
  const term = searchQuery.trim().toLowerCase();

  if (!term) {
    setSearchResults([]);
    return;
  }

  setSearchLoading(true);

  try {
    const snapshot = await getDocs(collection(db, 'pages'));

    const results = snapshot.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      .filter(
        (p) =>
          typeof p.name === 'string' &&
          p.name.toLowerCase().includes(term)
      );

    setSearchResults(results);
  } catch (error) {
    Alert.alert('Page search failed', error.message);
  } finally {
    setSearchLoading(false);
  }
};

  const searchGroups = async () => {
  const term = searchQuery.trim().toLowerCase();

  if (!term) {
    setSearchResults([]);
    return;
  }

  setSearchLoading(true);

  try {
    const snapshot = await getDocs(collection(db, 'groups'));

    const results = snapshot.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      .filter(
        (g) =>
          typeof g.name === 'string' &&
          g.name.toLowerCase().includes(term)
      );

    setSearchResults(results);
  } catch (error) {
    Alert.alert('Group search failed', error.message);
  } finally {
    setSearchLoading(false);
  }
};

  const requestToJoinGroup = async (group) => {
  if (!user?.uid || !group?.id) return;

  try {
    const existing = await getDocs(
      query(
        collection(db, 'groupJoinRequests'),
        where('groupId', '==', group.id),
        where('userUid', '==', user.uid),
        where('status', '==', 'pending')
      )
    );

    if (!existing.empty) {
      Alert.alert('Request already sent', 'You already requested to join this group.');
      return;
    }

    await addDoc(collection(db, 'groupJoinRequests'), {
  groupId: group.id,
  groupName: group.name,
  ownerUid: group.createdBy,
  userUid: user.uid,
  userName: user.name,
  status: 'pending',
  createdAt: serverTimestamp(),
});

    await addDoc(collection(db, 'notifications'), {
      recipientUid: group.createdBy,
      type: 'group_join_request',
      groupId: group.id,
      groupName: group.name,
      fromUid: user.uid,
      fromName: user.name,
      read: false,
      timestamp: serverTimestamp(),
    });

    Alert.alert('Request sent', 'The group owner has been notified.');
  } catch (error) {
    Alert.alert('Request failed', error.message);
  }
};

  const joinPublicGroup = async (group) => {
  if (!user?.uid || !group?.id) return;

  if ((group.members || []).includes(user.uid)) {
    Alert.alert('Already joined', 'You are already a member of this group.');
    return;
  }

  try {
    await updateDoc(doc(db, 'groups', group.id), {
      members: arrayUnion(user.uid),
      [`memberNames.${user.uid}`]: user.name,
    });

    await addDoc(collection(db, 'notifications'), {
      recipientUid: group.createdBy,
      type: 'group_joined',
      groupId: group.id,
      groupName: group.name,
      fromUid: user.uid,
      fromName: user.name,
      read: false,
      timestamp: serverTimestamp(),
    });

    Alert.alert('Joined', `You joined ${group.name}`);
  } catch (error) {
    Alert.alert('Join failed', error.message);
  }
};

  const approveGroupJoinRequest = async (request) => {
  if (!user?.uid || !request?.id || !request?.groupId) return;

  try {
    const groupRef = doc(db, 'groups', request.groupId);
    const groupSnap = await getDoc(groupRef);

    if (!groupSnap.exists()) {
      Alert.alert('Error', 'This group no longer exists.');
      return;
    }

    const group = groupSnap.data();

    if (group.createdBy !== user.uid) {
      Alert.alert('Not allowed', 'Only the group owner can approve requests.');
      return;
    }

    await updateDoc(groupRef, {
      members: arrayUnion(request.userUid),
      [`memberNames.${request.userUid}`]: request.userName,
    });

    await updateDoc(doc(db, 'groupJoinRequests', request.id), {
      status: 'approved',
    });

    await addDoc(collection(db, 'notifications'), {
      recipientUid: request.userUid,
      type: 'group_join_approved',
      groupId: request.groupId,
      groupName: request.groupName,
      fromUid: user.uid,
      fromName: user.name,
      read: false,
      timestamp: serverTimestamp(),
    });

    Alert.alert('Approved', `${request.userName} has joined the group.`);
  } catch (error) {
    Alert.alert('Approval failed', error.message);
  }
};

const rejectGroupJoinRequest = async (request) => {
  if (!user?.uid || !request?.id || !request?.groupId) return;

  try {
    const groupRef = doc(db, 'groups', request.groupId);
    const groupSnap = await getDoc(groupRef);

    if (!groupSnap.exists()) {
      Alert.alert('Error', 'This group no longer exists.');
      return;
    }

    const group = groupSnap.data();

    if (group.createdBy !== user.uid) {
      Alert.alert('Not allowed', 'Only the group owner can reject requests.');
      return;
    }

    await updateDoc(doc(db, 'groupJoinRequests', request.id), {
      status: 'rejected',
    });

    await addDoc(collection(db, 'notifications'), {
      recipientUid: request.userUid,
      type: 'group_join_rejected',
      groupId: request.groupId,
      groupName: request.groupName,
      fromUid: user.uid,
      fromName: user.name,
      read: false,
      timestamp: serverTimestamp(),
    });

    Alert.alert('Rejected', `${request.userName}'s request was rejected.`);
  } catch (error) {
    Alert.alert('Rejection failed', error.message);
  }
};

  const sendFriendRequest = async (targetUser) => {
  try {
    await setDoc(
      doc(db, 'friendRequests', `${user.uid}_${targetUser.uid}`),
      {
        fromUid: user.uid,
        fromName: user.name,
        toUid: targetUser.uid,
        toName: targetUser.name,
        status: 'pending',
createdAt: serverTimestamp(),
      }
    );

        await addDoc(collection(db, 'notifications'), {
      recipientUid: targetUser.uid,
      from: user.name,
      text: `${user.name} sent you a friend request.`,
      type: 'friend_request',
      read: false,
      createdAt: serverTimestamp(),
    });

    Alert.alert(
      'Friend request sent',
      `Friend request sent to ${targetUser.name}`
    );
  } catch (error) {
    Alert.alert('Failed', error.message);
  }
};

  const acceptFriendRequest = async (req) => {
    try {
      await updateDoc(doc(db, 'friendRequests', req.id), {
  status: 'accepted',
  acceptedAt: serverTimestamp(),
});
      const chatId = [user.uid, req.fromUid].sort().join('_');
      await setDoc(doc(db, 'privateChats', chatId), {
        members: [user.uid, req.fromUid],
        memberNames: { [user.uid]: user.name, [req.fromUid]: req.fromName },
      });

      await addDoc(collection(db, 'notifications'), {
  recipientUid: req.fromUid,
  from: user.name,
  text: `${user.name} accepted your friend request.`,
  type: 'friend_request_accepted',
  read: false,
  createdAt: serverTimestamp(),
});
      
    } catch (error) {
      Alert.alert('Failed', error.message);
    }
  };

  const rejectFriendRequest = async (req) => {
  try {
    await updateDoc(doc(db, 'friendRequests', req.id), {
      status: 'rejected',
      rejectedAt: serverTimestamp(),
    });

       await addDoc(collection(db, 'notifications'), {
      recipientUid: req.fromUid,
      from: user.name,
      text: `${user.name} declined your friend request.`,
      type: 'friend_request_rejected',
      read: false,
      createdAt: serverTimestamp(),
    });
    
  } catch (error) {
    Alert.alert('Failed', error.message);
  }
};

  const openPrivateChat = (friend) => {
    setActivePrivateFriend(friend);
    setScreen('chat');
  };
const toggleGroupSelect = (uid) => {
    setSelectedForGroup((prev) => prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]);
  };

  const createGroup = async () => {
    if (!newGroupName.trim() || selectedForGroup.length === 0) {
      Alert.alert('Missing info', 'Give your group a name and pick at least one friend.');
      return;
    }
    try {
      const memberNames = { [user.uid]: user.name };
      realFriends.forEach((f) => { if (selectedForGroup.includes(f.uid)) memberNames[f.uid] = f.name; });
      await addDoc(collection(db, 'groups'), {
  name: newGroupName,
  members: [user.uid, ...selectedForGroup],
  memberNames,
  createdBy: user.uid,
  privacy: groupPrivacy,
});
      setCreatingGroup(false);
      setNewGroupName('');
      setSelectedForGroup([]);
    } catch (error) {
      Alert.alert('Failed to create group', error.message);
    }
  };

  const sendGroupChatMessage = async () => {
    if (!groupMsgDraft.trim() || !activeGroup) return;
    try {
      await addDoc(collection(db, 'groups', activeGroup.id, 'messages'), {
        text: groupMsgDraft, senderUid: user.uid, senderName: user.name, timestamp: serverTimestamp(),
      });
      setGroupMsgDraft('');
    } catch (error) {
      Alert.alert('Message failed', error.message);
    }
  };
    
    const sendPrivateMessage = async () => {
    if (!privateDraft.trim() || !activePrivateFriend) return;
    const chatId = [user.uid, activePrivateFriend.uid].sort().join('_');
    try {
            await addDoc(collection(db, 'privateChats', chatId, 'messages'), {
        text: privateDraft,
        senderUid: user.uid,
        senderName: user.name,
        timestamp: serverTimestamp(),
      });

      setPrivateDraft('');
    } catch (error) {
      Alert.alert('Message failed', error.message);
    }
  };

const sendGroupMessage = async () => {
  if (!groupDraft.trim()) return;

  try {
    await addDoc(
      collection(db, 'familyChat'),
      {
        text: groupDraft,
        sender: user.name,
        senderEmail: user.email,
        timestamp: serverTimestamp(),
      }
    );

    setGroupDraft('');
  } catch (error) {
    Alert.alert(
      'Message failed',
      error.message
    );
  }
};

const sendVoiceNote = () => {
  if (!activeChatId) return;

  const msgId = Date.now();

  setChats((prev) =>
    prev.map((c) =>
      c.id === activeChatId
        ? {
            ...c,
            messages: [
              ...c.messages,
              {
                id: msgId,
                from: 'me',
                text: '🎤 Voice note · 0:05',
                read: false,
              },
            ],
          }
        : c
    )
  );
};

const sendAiMessage = () => {
  if (!aiDraft.trim()) return;

  const question = aiDraft;

  setAiMessages((prev) => [
    ...prev,
    {
      id: Date.now(),
      from: 'user',
      text: question,
    },
  ]);

  setAiDraft('');

  setTimeout(() => {
    setAiMessages((prev) => [
      ...prev,
      {
        id: Date.now() + 1,
        from: 'bot',
        text: getBotReply(question),
      },
    ]);
  }, 700);
};

  const verifySignupCode = () => {
    if (codeInput !== signupCode) {
      Alert.alert('Incorrect code', 'That code doesn\'t match. Please try again.');
      return;
    }
    setUser({ name: nameInput, gender: genderInput, age: ageInput, email: emailInput, location: '', photo: null, profileComplete: false });
  };

  const saveUsername = async () => {
  const newName = editName.trim();

  if (!newName) {
    Alert.alert('Name needed', 'Please enter your name.');
    return;
  }

  if (!user?.uid) {
    Alert.alert('Error', 'Please log in again and try.');
    return;
  }

  try {
    await updateDoc(doc(db, 'users', user.uid), {
      name: newName,
    });

    setUser((prev) => ({
      ...prev,
      name: newName,
    }));

    setEditName('');
    setEditNameVisible(false);

    Alert.alert('Success', 'Your username has been updated.');
  } catch (error) {
    Alert.alert('Error', error.message);
  }
};

  const requestResetCode = async () => {
  if (!user?.email) {
    Alert.alert('Email needed', 'Please log in with your email first.');
    return;
  }

  try {
    await sendPasswordResetEmail(auth, user.email);

    Alert.alert(
      'Check your email',
      `A password reset link has been sent to ${user.email}.`
    );
  } catch (error) {
    Alert.alert('Reset failed', error.message);
  }
};

  if (!appReady) {
    return (
      <View style={[styles.app, { backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={[styles.title, { color: accent, fontSize: 30 }]}>Ascend</Text>
        <Text style={{ color: subtext, marginTop: 10, fontSize: 16, fontWeight: '700' }}>{loadingDots}</Text>
      </View>
    );
}

const handleSignup = async () => {
  if (!genderInput.trim() || !ageInput.trim() || !emailInput.trim() || !passInput.trim()) {
    Alert.alert(
      'Missing info',
      'Please fill in your gender, age, email, and password first.'
    );
    return;
  }

  setAuthLoading(true);

  try {
    const result = await createUserWithEmailAndPassword(
      auth,
      emailInput,
      passInput
    );

    await sendEmailVerification(result.user);

    let photoUrl = null;

    if (signupPhoto) {
      const response = await fetch(signupPhoto);
      const blob = await response.blob();

      const fileRef = ref(
        storage,
        `profilePictures/${result.user.uid}_${Date.now()}`
      );

      await uploadBytes(fileRef, blob);
      photoUrl = await getDownloadURL(fileRef);
    }

    await setDoc(doc(db, 'users', result.user.uid), {
      uid: result.user.uid,
      name: nameInput.trim(),
      gender: genderInput,
      age: Number(ageInput),
      email: emailInput.trim().toLowerCase(),
      location: '',
      photo: photoUrl,
      profileComplete: false,
      points: 40,
      lastLoginDate: new Date().toISOString().slice(0, 10),
      Verified: false,
      isOfficial: false,
      createdAt: serverTimestamp(),
    });

    Alert.alert(
      'Check your email',
      'We sent a verification link to ' +
        emailInput +
        '. Tap it to confirm your account.'
    );

    setUser({
      name: nameInput,
      gender: genderInput,
      age: ageInput,
      email: emailInput,
      location: '',
      photo: photoUrl,
      profileComplete: false,
      uid: result.user.uid,
    });
  } catch (error) {
    Alert.alert('Sign up failed', error.message);
  } finally {
    setAuthLoading(false);
  }
};

const choosePagePhoto = async () => {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setPagePhoto(result.assets[0].uri);
    }
  } catch (error) {
    Alert.alert('Photo error', error.message);
  }
};

  const handleCreatePage = async () => {
    if (!user?.uid) {
      Alert.alert('Login required', 'Please log in before creating a page.');
      return;
    }

    if (!pageNameInput.trim() || !pageDescriptionInput.trim() || !pageCategoryInput.trim()) {
      Alert.alert('Missing information', 'Please enter the page name, description, and category.');
      return;
    }

    try {
  let pagePhotoUrl = '';

  if (pagePhoto) {
    const response = await fetch(pagePhoto);
    const blob = await response.blob();

    const fileRef = ref(
      storage,
      `pagePictures/${user.uid}_${Date.now()}`
    );

    await uploadBytes(fileRef, blob);
    pagePhotoUrl = await getDownloadURL(fileRef);
  }

  await addDoc(collection(db, 'pages'), {
    name: pageNameInput.trim(),
    description: pageDescriptionInput.trim(),
    category: pageCategoryInput.trim(),
    ownerUid: user.uid,
    ownerName: user.name || '',
    photo: pagePhotoUrl,
    Verified: false,
    isOfficial: false,
    followersCount: 0,
    createdAt: serverTimestamp(),
  });

  Alert.alert('Page created', 'Your page has been created successfully.');

  setPageNameInput('');
  setPageDescriptionInput('');
  setPageCategoryInput('');
  setPagePhoto(null);
  setCreatePageOpen(false);
} catch (error) {
  Alert.alert('Page creation failed', error.message);
    }
  };

const handleFollowPage = async (pageId) => {
  if (!user?.uid) {
    Alert.alert('Login required', 'Please log in first.');
    return;
  }

  try {
    const existingFollow = await getDocs(
      query(
        collection(db, 'follows'),
        where('userUid', '==', user.uid),
        where('pageId', '==', pageId)
      )
    );

    if (!existingFollow.empty) {
      Alert.alert('Already following', 'You already follow this page.');
      return;
    }

    await addDoc(collection(db, 'follows'), {
      userUid: user.uid,
      userName: user.name || '',
      pageId: pageId,
      createdAt: serverTimestamp(),
    });

   await updateDoc(doc(db, 'pages', pageId), {
  followersCount: increment(1),
});

    Alert.alert('Following', 'You are now following this page.');
  } catch (error) {
    Alert.alert('Follow failed', error.message);
  }
};

const handleUnfollowPage = async (pageId) => {
  if (!user?.uid) {
    Alert.alert('Login required', 'Please log in first.');
    return;
  }

  try {
    const existingFollow = await getDocs(
      query(
        collection(db, 'follows'),
        where('userUid', '==', user.uid),
        where('pageId', '==', pageId)
      )
    );

    if (existingFollow.empty) {
      Alert.alert('Not following', 'You do not follow this page.');
      return;
    }

    await deleteDoc(existingFollow.docs[0].ref);

    await updateDoc(doc(db, 'pages', pageId), {
      followersCount: increment(-1),
    });

    Alert.alert('Unfollowed', 'You no longer follow this page.');
  } catch (error) {
    Alert.alert('Unfollow failed', error.message);
  }
};

const openPageProfile = async (pageId) => {
  try {
    const pageRef = doc(db, 'pages', pageId);
    const pageSnap = await getDoc(pageRef);

    if (pageSnap.exists()) {
      setPageProfile({
        id: pageSnap.id,
        ...pageSnap.data(),
      });
    } else {
      Alert.alert('Page not found', 'This page no longer exists.');
    }
  } catch (error) {
    Alert.alert('Page failed', error.message);
  }
};

  const handleLogin = async () => {
  setAuthLoading(true);

  try {
    await signInWithEmailAndPassword(
      auth,
      emailInput.trim(),
      passInput
    );
  } catch (error) {
    Alert.alert('Log in failed', error.message);
  } finally {
    setAuthLoading(false);
  }
};
if (!user) {
    return (
      <ScrollView contentContainerStyle={[styles.app, { backgroundColor: bg, flexGrow: 1, justifyContent: 'center' }]}>
        <Text style={[styles.title, { color: accent, textAlign: 'center', marginBottom: 24 }]}>Ascend</Text>

        {authMode === 'signup' && signupStage === 'name' && (
          <>
            <TextInput style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg }]} placeholder="Full name" placeholderTextColor={subtext} value={nameInput} onChangeText={setNameInput} />
            <TouchableOpacity style={[styles.button, { backgroundColor: accent }]} onPress={() => { if (!nameInput.trim()) { Alert.alert('Name needed', 'Please enter your full name.'); return; } setSignupStage('details'); }}>
              <Text style={styles.buttonText}>Next</Text>
            </TouchableOpacity>
          </>
        )}

        {authMode === 'signup' && signupStage === 'details' && (
          <>
            <Text style={{ color: text, fontWeight: '700', marginBottom: 8 }}>Gender</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {['Male', 'Female', 'Other'].map((g) => (
                <TouchableOpacity key={g} style={[styles.smallButton, { flex: 1, backgroundColor: genderInput === g ? accent : cardBg, borderWidth: 1, borderColor: border }]} onPress={() => setGenderInput(g)}>
                  <Text style={{ color: genderInput === g ? '#fff' : text, fontWeight: 'bold' }}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg }]} placeholder="Age" placeholderTextColor={subtext} keyboardType="number-pad" value={ageInput} onChangeText={setAgeInput} />
            <TextInput style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg }]} placeholder="Email address" placeholderTextColor={subtext} value={emailInput} onChangeText={setEmailInput} />
            <TextInput style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg }]} placeholder="Password" placeholderTextColor={subtext} secureTextEntry value={passInput} onChangeText={setPassInput} />
            <TouchableOpacity
  style={[styles.button, { backgroundColor: accent }]}
  onPress={() => {
    if (!genderInput.trim() || !ageInput.trim() || !emailInput.trim() || !passInput.trim()) {
      Alert.alert('Missing info', 'Please fill in your gender, age, email, and password first.');
      return;
    }

    setSignupStage('photo');
  }}
>
  <Text style={styles.buttonText}>Next</Text>
</TouchableOpacity>
            <TouchableOpacity onPress={() => setSignupStage('name')}>
              <Text style={{ color: accent, textAlign: 'center', marginTop: 4 }}>← Back</Text>
            </TouchableOpacity>
          </>
        )}

{authMode === 'signup' && signupStage === 'photo' && (
  <>
    <Text style={{ color: text, fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
      Add a Profile Picture
    </Text>

    <Text style={{ color: subtext, textAlign: 'center', marginBottom: 20 }}>
      Choose a profile picture so people can recognize you. You can also skip this for now.
    </Text>

    <View style={{
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: cardBg,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      marginBottom: 20,
      borderWidth: 1,
      borderColor: border,
    }}>
      {signupPhoto ? (
        <Image
          source={{ uri: signupPhoto }}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <Text style={{ color: accent, fontSize: 32, fontWeight: '700' }}>
          {nameInput?.charAt(0)?.toUpperCase()}
        </Text>
      )}
    </View>

    <TouchableOpacity
      style={[styles.button, { backgroundColor: accent }]}
      onPress={pickSignupPhoto}
    >
      <Text style={styles.buttonText}>
        Choose Profile Picture
      </Text>
    </TouchableOpacity>

    <TouchableOpacity
  style={[styles.button, {
    backgroundColor: cardBg,
    borderWidth: 1,
    borderColor: border,
    marginTop: 10,
  }]}
  onPress={handleSignup}
  disabled={authLoading}
>
  {authLoading ? (
    <ActivityIndicator color={text} />
  ) : (
    <Text style={{ color: text, textAlign: 'center', fontWeight: '700' }}>
      {signupPhoto ? 'Create Account' : 'Skip for Now'}
    </Text>
  )}
</TouchableOpacity>

    <TouchableOpacity onPress={() => setSignupStage('details')}>
      <Text style={{ color: accent, textAlign: 'center', marginTop: 12 }}>
        ← Back
      </Text>
    </TouchableOpacity>
  </>
)}

       {authMode === 'signup' && signupStage === 'code' && (
          <>
            <Text style={{ color: subtext, textAlign: 'center', marginBottom: 12 }}>Enter the code we sent you</Text>
            <TextInput style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg, textAlign: 'center', letterSpacing: 4, fontSize: 18 }]} placeholder="0000" placeholderTextColor={subtext} keyboardType="number-pad" value={codeInput} onChangeText={setCodeInput} />
            <TouchableOpacity style={[styles.button, { backgroundColor: accent }]} onPress={verifySignupCode}>
              <Text style={styles.buttonText}>Verify & Create Account</Text>
            </TouchableOpacity>
          </>
        )}

        {authMode === 'login' && (
          <>
            <TextInput style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg }]} placeholder="Email or phone number" placeholderTextColor={subtext} value={emailInput} onChangeText={setEmailInput} />
            <TextInput style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg }]} placeholder="Password" placeholderTextColor={subtext} secureTextEntry value={passInput} onChangeText={setPassInput} />
            <TouchableOpacity
  style={[styles.button, { backgroundColor: accent }]}
  onPress={authMode === 'signup' ? handleSignup : handleLogin}
  disabled={authLoading}
>
  {authLoading ? (
    <ActivityIndicator color="#fff" />
  ) : (
    <Text style={styles.buttonText}>Log in</Text>
  )}
</TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setSignupStage('name'); }}>
          <Text style={{ color: accent, textAlign: 'center', marginTop: 14 }}>
            {authMode === 'signup' ? 'Already have an account? Log in' : "New here? Create an account"}
          </Text>
        </TouchableOpacity>
        <Text style={{ color: subtext, textAlign: 'center', marginTop: 30, fontSize: 12 }}>
          Email sign-up creates a real account. Phone sign-in is coming soon.
        </Text>
        <Text style={{ color: subtext, textAlign: 'center', marginTop: 40, fontSize: 12, fontWeight: '700' }}>Ascend from MIDEON</Text>
      </ScrollView>
    );
  }return (
    <View style={[styles.app, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: accent }]}>Ascend</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={() => setNotifOpen(true)} style={{ position: 'relative' }}>
            <Text style={{ fontSize: 20 }}>🔔</Text>
            {notifications.some((n) => !n.read) && (
              <View style={{ position: 'absolute', top: -2, right: -2, width: 9, height: 9, borderRadius: 5, backgroundColor: '#C2403F' }} />
            )}
          </TouchableOpacity>
          <Text style={{ color: text, fontWeight: '700' }}>{points} pts · {rank.stage} {rank.label}</Text>
        </View>
      </View>

      {screen === 'feed' && (
        <View style={{ flex: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            <View style={{ alignItems: 'center', marginRight: 12 }}>
              <View style={{ width: 54, height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: accent, fontSize: 20, fontWeight: '700' }}>+</Text>
              </View>
              <Text style={{ color: subtext, fontSize: 11, marginTop: 4 }}>Your story</Text>
            </View>
            {friends.map((f) => (
              <TouchableOpacity key={f} style={{ alignItems: 'center', marginRight: 12 }} onPress={() => openProfile(f)}>
                <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>{f.charAt(0)}</Text>
                </View>
                <Text style={{ color: subtext, fontSize: 11, marginTop: 4 }}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
            <TextInput style={{ color: text, fontSize: 14.5, minHeight: 20 }} placeholder="What's on your mind?" placeholderTextColor={subtext} value={draft} onChangeText={setDraft} />
            {draftMedia && (
              draftMedia.type === 'video'
                ? <Text style={{ color: subtext, marginTop: 8 }}>🎥 Video attached</Text>
                : <Image source={{ uri: draftMedia.uri }} style={{ width: '100%', height: 160, borderRadius: 10, marginTop: 8 }} />
            )}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
              <TouchableOpacity style={[styles.smallButton, { backgroundColor: bg, flex: 1 }]} onPress={pickMedia}>
                <Text style={{ color: text, fontWeight: 'bold', fontSize: 12.5 }}>📎 Photo/Video</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallButton, { backgroundColor: bg, flex: 1 }]} onPress={addFeeling}>
                <Text style={{ color: text, fontWeight: 'bold', fontSize: 12.5 }}>😊 Feeling</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallButton, { backgroundColor: bg, flex: 1 }]} onPress={() => setScreen('ranks')}>
                <Text style={{ color: text, fontWeight: 'bold', fontSize: 12.5 }}>🏆 Point</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.button, { backgroundColor: accent, marginTop: 10, marginBottom: 0 }]} onPress={addPost}>
              <Text style={styles.buttonText}>Post (+2)</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }}>
            {visiblePosts.map((p) => (
              <View key={p.id} style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <TouchableOpacity onPress={() => p.author !== user.name && openProfile(p.author)} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                      <Text style={{ color: accent, fontWeight: '700', fontSize: 13 }}>{p.author.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
  <Text style={{ color: text, fontWeight: '700' }}>
    {p.author}
  </Text>

  {p.verified === true && (
    <View style={{
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: '#16a34a',
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 5,
    }}>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>
    </View>
  )}
</View>
                  </TouchableOpacity>
                  {p.author !== user.name && (
                    <TouchableOpacity onPress={() => setProfileMenuFor(p.author)} style={{ padding: 4 }}>
                      <Text style={{ color: subtext, fontWeight: '900', fontSize: 16 }}>•••</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {!!p.text && <Text style={{ color: text, marginBottom: p.media ? 8 : 0, lineHeight: 20 }}>{p.text}</Text>}
                {p.media && (
                  p.media.type === 'video'
                    ? <TouchableOpacity onPress={() => p.media.uri && Linking.openURL(p.media.uri)} style={{ height: 160, borderRadius: 10, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 26 }}>🎥</Text></TouchableOpacity>
                    : <Image source={{ uri: p.media.uri }} style={{ width: '100%', height: 180, borderRadius: 10 }} />
                )}
      <View style={{ flexDirection: 'row', gap: 20, marginTop: 10 }}>
                  <TouchableOpacity onPress={() => toggleLike(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 16 }}>{(p.likes || []).includes(user.uid) ? '❤️' : '🤍'}</Text>
                    <Text style={{ color: subtext, fontSize: 12 }}>{(p.likes || []).length}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setCommentingPostId(commentingPostId === p.id ? null : p.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 16 }}>💬</Text>
                    <Text style={{ color: subtext, fontSize: 12 }}>{p.commentCount || 0}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => sharePost(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 16 }}>↗️</Text>
                    <Text style={{ color: subtext, fontSize: 12 }}>{p.shareCount || 0}</Text>
                  </TouchableOpacity>
                </View>
                {commentingPostId === p.id && (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                    <TextInput style={[styles.input, { borderColor: border, color: text, backgroundColor: bg, flex: 1, marginBottom: 0 }]} placeholder="Write a comment..." placeholderTextColor={subtext} value={commentDraft} onChangeText={setCommentDraft} />
                    <TouchableOpacity style={{ backgroundColor: accent, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' }} onPress={() => submitComment(p)}>
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>Post</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {screen === 'reels' && (
        <ScrollView style={{ flex: 1 }}>
          <Text style={{ color: text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Reels & Videos</Text>
          {videoPosts.length === 0 && <Text style={{ color: subtext }}>No videos posted yet. Attach one from the Feed to see it here.</Text>}
          {videoPosts.map((p) => (
            <View key={p.id} style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
              <Text style={{ color: text, fontWeight: '700', marginBottom: 8 }}>{p.author}</Text>
              <View style={{ height: 220, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 30 }}>🎥</Text>
                <Text style={{ color: subtext, marginTop: 6 }}>{p.text || 'Video'}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}{screen === 'chat' && !activeChatId && !groupChatOpen && !activePrivateFriend && (
        <ScrollView style={{ flex: 1 }}>

        <View
  style={{
    flexDirection: 'row',
    marginBottom: 10,
    justifyContent: 'space-between',
  }}
>
  <TouchableOpacity
    onPress={() => {
  setSearchCategory('people');
  setSearchResults([]);
}}
    style={{
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor:
        searchCategory === 'people' ? accent : border,
    }}
  >
    <Text
      style={{
        color: searchCategory === 'people' ? accent : subtext,
        fontWeight: '700',
      }}
    >
      People
    </Text>
  </TouchableOpacity>

  <TouchableOpacity
    onPress={() => {
  setSearchCategory('pages');
  setSearchResults([]);
}}
    style={{
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor:
        searchCategory === 'pages' ? accent : border,
    }}
  >
    <Text
      style={{
        color: searchCategory === 'pages' ? accent : subtext,
        fontWeight: '700',
      }}
    >
      Pages
    </Text>
  </TouchableOpacity>

  <TouchableOpacity
    onPress={() => {
  setSearchCategory('groups');
  setSearchResults([]);
}}
    style={{
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor:
        searchCategory === 'groups' ? accent : border,
    }}
  >
    <Text
      style={{
        color: searchCategory === 'groups' ? accent : subtext,
        fontWeight: '700',
      }}
    >
      Groups
    </Text>
  </TouchableOpacity>
</View>
        
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <TextInput style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg, flex: 1, marginBottom: 0 }]} placeholder={
  searchCategory === 'people'
    ? '🔍 Search people by name...'
    : searchCategory === 'pages'
    ? '🔍 Search pages by name...'
    : '🔍 Search groups by name...'
      } placeholderTextColor={subtext} value={searchQuery} onChangeText={setSearchQuery} />
            <TouchableOpacity style={{ backgroundColor: accent, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' }} onPress={() => {
  if (searchCategory === 'people') {
    searchUsers();
  } else if (searchCategory === 'pages') {
    searchPages();
  } else if (searchCategory === 'groups') {
    searchGroups();
  }
}}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Go</Text>
            </TouchableOpacity>
          </View>
          {searchLoading ? (
  <View style={{ alignItems: 'center', paddingVertical: 20 }}>
    <Text style={{ color: subtext, fontWeight: '700' }}>
      Searching...
    </Text>
  </View>
) : (
    searchResults.map((r) => (
  <View
    key={r.id || r.uid}
    style={[
      styles.card,
      {
        backgroundColor: cardBg,
        borderColor: border,
        flexDirection: 'row',
        alignItems: 'center',
      },
    ]}
  >
    <View style={{ flex: 1 }}>
  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    <Text style={{ color: text, fontWeight: '700' }}>
      {r.name}
    </Text>

    {searchCategory === 'pages' && r.Verified === true && (
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: '#16a34a',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 6,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>
          ✓
        </Text>
      </View>
    )}
  </View>

      {searchCategory === 'pages' && (
        <Text style={{ color: subtext, fontSize: 12, marginTop: 3 }}>
          {r.category || 'Page'} • {r.followersCount || 0} followers
        </Text>
      )}

      {searchCategory === 'groups' && (
        <Text style={{ color: subtext, fontSize: 12, marginTop: 3 }}>
          {r.privacy === 'private' ? 'Private group' : 'Public group'}
        </Text>
      )}
    </View>

    {searchCategory === 'people' && (
      <TouchableOpacity
        style={{
          backgroundColor: accent,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
        }}
        onPress={() => sendFriendRequest(r)}
      >
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
          Add
        </Text>
      </TouchableOpacity>
    )}

    {searchCategory === 'pages' && (
  followedPages.includes(r.id) ? (
    <TouchableOpacity
      style={{
        backgroundColor: border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
      onPress={() => handleUnfollowPage(r.id)}
    >
      <Text style={{ color: text, fontSize: 12, fontWeight: '700' }}>
        Following
      </Text>
    </TouchableOpacity>
  ) : (
    <TouchableOpacity
      style={{
        backgroundColor: accent,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
      onPress={() => handleFollowPage(r.id)}
    >
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
        Follow
      </Text>
    </TouchableOpacity>
  )
)}

    {searchCategory === 'groups' && (
      (r.members || []).includes(user?.uid) ? (
        <TouchableOpacity
          disabled
          style={{
            backgroundColor: border,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: text, fontSize: 12, fontWeight: '700' }}>
            Joined
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={{
            backgroundColor: accent,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
          onPress={() =>
            r.privacy === 'private'
              ? requestToJoinGroup(r)
              : joinPublicGroup(r)
          }
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
            {r.privacy === 'private' ? 'Request' : 'Join'}
          </Text>
        </TouchableOpacity>
      )
    )}
  </View>
))}


          {incomingRequests.length > 0 && <Text style={{ color: text, fontWeight: '700', marginTop: 10, marginBottom: 6 }}>Friend Requests</Text>}
          {incomingRequests.map((req) => (
  <View
    key={req.id}
    style={[
      styles.card,
      {
        backgroundColor: cardBg,
        borderColor: border,
        flexDirection: 'row',
        alignItems: 'center',
      },
    ]}
  >
    <Text style={{ color: text, flex: 1 }}>{req.fromName}</Text>

    <TouchableOpacity
      style={{
        backgroundColor: accent,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginRight: 8,
      }}
      onPress={() => acceptFriendRequest(req)}
    >
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
        Accept
      </Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={{
        backgroundColor: '#555',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
      onPress={() => rejectFriendRequest(req)}
    >
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
        Reject
      </Text>
    </TouchableOpacity>
  </View>
))}

          <Text style={{ color: text, fontWeight: '700', marginTop: 10, marginBottom: 6 }}>
  Friends ({realFriends.length})
</Text>
          {realFriends.map((f) => (
            <TouchableOpacity key={f.uid} style={[styles.card, { backgroundColor: cardBg, borderColor: border }]} onPress={() => openPrivateChat(f)}>
              <Text style={{ color: text, fontWeight: '700' }}>{f.name}</Text>
            </TouchableOpacity>
          ))}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 6 }}>
            <Text style={{ color: text, fontWeight: '700' }}>Groups</Text>
            <TouchableOpacity onPress={() => setCreatingGroup(true)}>
              <Text style={{ color: accent, fontWeight: '700' }}>+ New Group</Text>
            </TouchableOpacity>
          </View>
          {groups.map((g) => (
            <TouchableOpacity key={g.id} style={[styles.card, { backgroundColor: cardBg, borderColor: border }]} onPress={() => setActiveGroup(g)}>
              <Text style={{ color: text, fontWeight: '700' }}>{g.name}</Text>
              <Text style={{ color: subtext, fontSize: 12 }}>{Object.values(g.memberNames || {}).join(', ')}</Text>
            </TouchableOpacity>
          ))}

          {groupJoinRequests.length > 0 && (
  <View style={{ marginTop: 12 }}>
    <Text style={{ color: text, fontWeight: '700', marginBottom: 8 }}>
      Group Join Requests
    </Text>

    {groupJoinRequests.map((request) => (
      <View
        key={request.id}
        style={[
          styles.card,
          {
            backgroundColor: cardBg,
            borderColor: border,
          },
        ]}
      >
        <Text style={{ color: text, fontWeight: '700' }}>
          {request.userName}
        </Text>

        <Text style={{ color: subtext, fontSize: 12, marginTop: 3 }}>
          wants to join {request.groupName}
        </Text>

        <TouchableOpacity
          style={{
            backgroundColor: accent,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 7,
            marginTop: 8,
            alignSelf: 'flex-start',
          }}
          onPress={() => approveGroupJoinRequest(request)}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
            Approve
          </Text>
        </TouchableOpacity>

       <TouchableOpacity
  style={{
    backgroundColor: '#dc2626',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 8,
    alignSelf: 'flex-start',
  }}
  onPress={() => rejectGroupJoinRequest(request)}
>
  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
    Reject
  </Text>
</TouchableOpacity>
      </View>
    ))}
  </View>
)}

          <TouchableOpacity style={[styles.card, { backgroundColor: cardBg, borderColor: accent, borderWidth: 1.5, marginTop: 10 }]} onPress={() => setGroupChatOpen(true)}>
            <Text style={{ color: text, fontWeight: '700' }}>🌐 Family & Friends (real chat)</Text>
            <Text style={{ color: subtext, fontSize: 12 }}>Everyone with the app can message here for real</Text>
          </TouchableOpacity>
          {chats.map((c) => (
            <TouchableOpacity key={c.id} style={[styles.card, { backgroundColor: cardBg, borderColor: border, flexDirection: 'row', alignItems: 'center' }]} onPress={() => setActiveChatId(c.id)}>
              <View style={{ marginRight: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: accent, fontWeight: '700' }}>{c.name.charAt(0)}</Text>
                </View>
                <View style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: c.online ? '#1E8449' : '#9aa393', borderWidth: 2, borderColor: cardBg }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: text, fontWeight: '700' }}>{c.name}</Text>
                <Text style={{ color: subtext, fontSize: 12.5 }}>{c.messages[c.messages.length - 1]?.text || 'Say hi 👋'}</Text>
              </View>
              <Text style={{ color: c.online ? accent : subtext, fontSize: 11.5, fontWeight: '600' }}>{c.online ? 'Active now' : 'Offline'}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
{creatingGroup && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: bg, zIndex: 20, paddingTop: 60, paddingHorizontal: 16 }}>
          <TouchableOpacity onPress={() => setCreatingGroup(false)} style={{ marginBottom: 16 }}>
            <Text style={{ color: accent, fontWeight: '700' }}>← Back</Text>
          </TouchableOpacity>
          <TextInput style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg }]} placeholder="Group name" placeholderTextColor={subtext} value={newGroupName} onChangeText={setNewGroupName} />

  <Text style={{ color: text, fontWeight: '700', marginBottom: 8 }}>
  Group privacy
</Text>

<View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
  <TouchableOpacity
    onPress={() => setGroupPrivacy('public')}
    style={{
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
      backgroundColor: groupPrivacy === 'public' ? accent : cardBg,
      borderWidth: 1,
      borderColor: groupPrivacy === 'public' ? accent : border,
    }}
  >
    <Text style={{ color: groupPrivacy === 'public' ? '#fff' : text, fontWeight: '700' }}>
      Public
    </Text>
  </TouchableOpacity>

  <TouchableOpacity
    onPress={() => setGroupPrivacy('private')}
    style={{
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
      backgroundColor: groupPrivacy === 'private' ? accent : cardBg,
      borderWidth: 1,
      borderColor: groupPrivacy === 'private' ? accent : border,
    }}
  >
    <Text style={{ color: groupPrivacy === 'private' ? '#fff' : text, fontWeight: '700' }}>
      Private
    </Text>
  </TouchableOpacity>
</View>
          <Text style={{ color: text, fontWeight: '700', marginBottom: 8 }}>Add friends</Text>
          <ScrollView style={{ flex: 1, marginBottom: 12 }}>
            {realFriends.map((f) => (
              <TouchableOpacity key={f.uid} style={[styles.card, { backgroundColor: selectedForGroup.includes(f.uid) ? accent : cardBg, borderColor: border }]} onPress={() => toggleGroupSelect(f.uid)}>
                <Text style={{ color: selectedForGroup.includes(f.uid) ? '#fff' : text }}>{f.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={[styles.button, { backgroundColor: accent }]} onPress={createGroup}>
            <Text style={styles.buttonText}>Create Group</Text>
          </TouchableOpacity>
        </View>
      )}

      {screen === 'chat' && activeGroup && (
        <View style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => setActiveGroup(null)} style={{ marginBottom: 10 }}>
            <Text style={{ color: accent, fontWeight: '700' }}>← Back</Text>
          </TouchableOpacity>
          <Text style={{ color: text, fontWeight: '700', marginBottom: 8 }}>{activeGroup.name}</Text>
          <ScrollView style={{ flex: 1, marginBottom: 8 }}>
            {groupMsgs.map((m) => (
              <View key={m.id} style={{ alignItems: m.senderUid === user.uid ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
                {m.senderUid !== user.uid && <Text style={{ color: subtext, fontSize: 11, marginBottom: 2 }}>{m.senderName}</Text>}
                <View style={{ backgroundColor: m.senderUid === user.uid ? accent : cardBg, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, maxWidth: '75%' }}>
                  <Text style={{ color: m.senderUid === user.uid ? '#fff' : text }}>{m.text}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg, flex: 1, marginBottom: 0 }]} placeholder="Message the group..." placeholderTextColor={subtext} value={groupMsgDraft} onChangeText={setGroupMsgDraft} />
            <TouchableOpacity style={{ backgroundColor: accent, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' }} onPress={sendGroupChatMessage}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
{screen === 'chat' && activePrivateFriend && (
        <View style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => setActivePrivateFriend(null)} style={{ marginBottom: 10 }}>
            <Text style={{ color: accent, fontWeight: '700' }}>← Back</Text>
          </TouchableOpacity>
          <Text style={{ color: text, fontWeight: '700', marginBottom: 8 }}>{activePrivateFriend.name}</Text>
          <ScrollView style={{ flex: 1, marginBottom: 8 }}>
            {privateMessages.map((m) => (
              <View key={m.id} style={{ alignItems: m.senderUid === user.uid ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
                <View style={{ backgroundColor: m.senderUid === user.uid ? accent : cardBg, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, maxWidth: '75%' }}>
                  <Text style={{ color: m.senderUid === user.uid ? '#fff' : text }}>{m.text}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg, flex: 1, marginBottom: 0 }]} placeholder="Message..." placeholderTextColor={subtext} value={privateDraft} onChangeText={setPrivateDraft} />
            <TouchableOpacity style={{ backgroundColor: accent, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' }} onPress={sendPrivateMessage}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
{screen === 'chat' && groupChatOpen && (
        <View style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => setGroupChatOpen(false)} style={{ marginBottom: 10 }}>
            <Text style={{ color: accent, fontWeight: '700' }}>← Back</Text>
          </TouchableOpacity>
          <ScrollView style={{ flex: 1, marginBottom: 8 }}>
            {groupMessages.map((m) => (
              <View key={m.id} style={{ alignItems: m.senderEmail === user.email ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
                {m.senderEmail !== user.email && <Text style={{ color: subtext, fontSize: 11, marginBottom: 2 }}>{m.sender}</Text>}
                <View style={{ backgroundColor: m.senderEmail === user.email ? accent : cardBg, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, maxWidth: '75%' }}>
                  <Text style={{ color: m.senderEmail === user.email ? '#fff' : text }}>{m.text}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg, flex: 1, marginBottom: 0 }]} placeholder="Message everyone..." placeholderTextColor={subtext} value={groupDraft} onChangeText={setGroupDraft} />
            <TouchableOpacity style={{ backgroundColor: accent, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' }} onPress={sendGroupMessage}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {screen === 'chat' && activeChat && (
        <View style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => setActiveChatId(null)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ color: accent, fontWeight: '700', marginRight: 10 }}>←</Text>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: cardBg, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
              <Text style={{ color: accent, fontWeight: '700' }}>{activeChat.name.charAt(0)}</Text>
            </View>
            <View>
              <Text style={{ color: text, fontWeight: '700' }}>{activeChat.name}</Text>
              <Text style={{ color: activeChat.online ? accent : subtext, fontSize: 11.5 }}>{activeChat.online ? 'Active now' : 'Offline'}</Text>
            </View>
          </TouchableOpacity>
          <ScrollView style={{ flex: 1, marginBottom: 8 }}>
            {activeChat.messages.map((m, i) => (
              <View key={m.id} style={{ alignItems: m.from === 'me' ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
                <View style={{ backgroundColor: m.from === 'me' ? accent : cardBg, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, maxWidth: '75%' }}>
                  <Text style={{ color: m.from === 'me' ? '#fff' : text }}>{m.text}</Text>
                </View>
                {m.from === 'me' && i === activeChat.messages.length - 1 && (
                  <Text style={{ color: subtext, fontSize: 10.5, marginTop: 2 }}>{m.read ? 'Seen' : 'Sent'}</Text>
                )}
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: border, borderRadius: 10, width: 42, alignItems: 'center', justifyContent: 'center' }} onPress={sendVoiceNote}>
              <Text style={{ fontSize: 16 }}>🎤</Text>
            </TouchableOpacity>
            <TextInput style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg, flex: 1, marginBottom: 0 }]} placeholder="Message..." placeholderTextColor={subtext} value={chatDraft} onChangeText={setChatDraft} />
            <TouchableOpacity style={{ backgroundColor: accent, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' }} onPress={sendChatMessage}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {screen === 'ranks' && (
        <ScrollView style={{ flex: 1 }}>
          <Text style={{ color: text, fontSize: 20, fontWeight: '700', marginBottom: 4 }}>{rank.stage} {rank.label}</Text>
          <Text style={{ color: subtext, marginBottom: 16 }}>
            {points} pts total{next ? ` · ${Math.max(0, rank.to - points)} pts to ${next.stage} ${next.label}` : ' · Max rank!'}
          </Text>
          {LEVELS.map((l, i) => (
            <View key={l.stage + l.label} style={[styles.rankRow, { borderColor: border, backgroundColor: l === rank ? accent : cardBg }]}>
              <Text style={{ color: l === rank ? '#fff' : text, fontWeight: '600' }}>{l.stage} {l.label}</Text>
              <Text style={{ color: l === rank ? '#fff' : subtext }}>{l.stepCost.toLocaleString()}{i === LEVELS.length - 1 ? '+' : ''} pts</Text>
            </View>
          ))}
          {[
            { label: 'Legendary IV', req: 'Top 5000' },
            { label: 'Legendary III', req: 'Top 3500' },
            { label: 'Legendary II', req: 'Top 2500' },
            { label: 'Legendary I', req: 'Top 1000' },
          ].map((lg) => (
            <View key={lg.label} style={[styles.rankRow, { borderColor: border, backgroundColor: cardBg, borderStyle: 'dashed' }]}>
              <Text style={{ color: text, fontWeight: '700' }}>🏆 {lg.label}</Text>
              <Text style={{ color: subtext }}>{lg.req} only</Text>
            </View>
          ))}
          <Text style={{ color: subtext, fontSize: 11.5, marginTop: 8 }}>
            Legendary ranks are reserved by leaderboard position, not a points total — Legendary I is the most exclusive. This needs Ascend's real leaderboard, once connected to a backend, to actually determine who qualifies.
          </Text>
        </ScrollView>
      )}{screen === 'profile' && (
        <ScrollView style={{ flex: 1 }}>
          <View style={{ height: 90, backgroundColor: accent, borderRadius: 12, marginBottom: -36 }} />
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: cardBg, borderWidth: 3, borderColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {user.photo ? <Image source={{ uri: user.photo }} style={{ width: '100%', height: '100%' }} /> : <Text style={{ fontSize: 28, fontWeight: '700', color: accent }}>{user.name.charAt(0).toUpperCase()}</Text>}
            </View>
                <TouchableOpacity
  onPress={pickProfileImage}
  style={{
    marginTop: 10,
    backgroundColor: accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  }}
>
  <Text style={{ color: '#fff', fontWeight: '700' }}>
    Change Profile Picture
  </Text>
</TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
  <Text style={{ color: text, fontSize: 19, fontWeight: '700' }}>
    {user.name}
  </Text>

  {user.Verified === true && (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#16a34a',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 6,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>
        ✓
      </Text>
    </View>
  )}
</View>
            {!!user.location && <Text style={{ color: subtext, fontSize: 12.5 }}>{user.location}</Text>}
            <View style={{ backgroundColor: accent, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 3, marginTop: 6 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12.5 }}>{rank.stage} {rank.label} · {points} pts</Text>
            </View>
            <Text style={{ color: subtext, marginTop: 4, fontSize: 12.5 }}>Rank shown to anyone viewing this profile</Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: border, paddingVertical: 14 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: text, fontWeight: '700', fontSize: 16 }}>{combinedPosts.filter(p => p.author === user.name).length}</Text>
              <Text style={{ color: subtext, fontSize: 12 }}>Posts</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: text, fontWeight: '700', fontSize: 16 }}>{friends.length}</Text>
              <Text style={{ color: subtext, fontSize: 12 }}>Friends</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: text, fontWeight: '700', fontSize: 16 }}>{idx + 1}/{LEVELS.length}</Text>
              <Text style={{ color: subtext, fontSize: 12 }}>Rank progress</Text>
            </View>
          </View>

          <Text style={{ color: text, fontWeight: '700', marginTop: 20, marginBottom: 8 }}>Friends</Text>
          {friends.map((f) => (
            <TouchableOpacity key={f} style={[styles.card, { backgroundColor: cardBg, borderColor: border, flexDirection: 'row', alignItems: 'center' }]} onPress={() => openProfile(f)}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                <Text style={{ color: accent, fontWeight: '700' }}>{f.charAt(0)}</Text>
              </View>
              <Text style={{ color: text }}>{f}</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={[styles.button, { backgroundColor: accent, marginTop: 20 }]} onPress={() => setScreen('settings')}>
            <Text style={styles.buttonText}>⚙️ Settings</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {screen === 'settings' && (
        <ScrollView style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => setScreen('profile')}>
            <Text style={{ color: accent, fontWeight: '700', marginBottom: 16 }}>← Back to Profile</Text>
          </TouchableOpacity>

        <TouchableOpacity
  onPress={() => setCreatePageOpen(true)}
  style={{
    backgroundColor: accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 16,
  }}
>
  <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>
    Create Page
  </Text>
</TouchableOpacity>

        <Text style={{ color: text, fontSize: 20, fontWeight: '700', marginBottom: 10 }}>
    Pages
  </Text>

  {pages.length === 0 ? (
    <Text style={{ color: subtext, marginBottom: 16 }}>
      No pages have been created yet.
    </Text>
  ) : (
    pages.map((page) => (
      <View
        key={page.id}
        style={{
          backgroundColor: cardBg,
          borderWidth: 1,
          borderColor: border,
          borderRadius: 12,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <TouchableOpacity onPress={() => openPageProfile(page.id)}>
  <Text style={{ color: text, fontSize: 18, fontWeight: '700' }}>
    {page.name}
  </Text>
</TouchableOpacity>

        <Text style={{ color: subtext, marginTop: 4 }}>
          {page.description}
        </Text>

        <Text style={{ color: subtext, marginTop: 4 }}>
          {page.category} • {page.followersCount || 0} followers
        </Text>

        {followedPages.includes(page.id) ? (
          <TouchableOpacity
            onPress={() => handleUnfollowPage(page.id)}
            style={{
              marginTop: 10,
              paddingVertical: 10,
              borderRadius: 8,
              backgroundColor: border,
            }}
          >
            <Text style={{ color: text, textAlign: 'center', fontWeight: '700' }}>
              Following
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => handleFollowPage(page.id)}
            style={{
              marginTop: 10,
              paddingVertical: 10,
              borderRadius: 8,
              backgroundColor: accent,
            }}
          >
            <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>
              Follow
            </Text>
          </TouchableOpacity>
        )}
      </View>
    ))
  )}

        <Text style={{ color: text, fontWeight: '700', marginTop: 8, marginBottom: 8 }}>
  Username
</Text>

{editNameVisible ? (
  <>
    <TextInput
      style={[styles.input, {
        borderColor: border,
        color: text,
        backgroundColor: cardBg
      }]}
      placeholder="Enter your username"
      placeholderTextColor={subtext}
      value={editName}
      onChangeText={setEditName}
    />

    <TouchableOpacity
      style={[styles.button, { backgroundColor: accent }]}
      onPress={saveUsername}
    >
      <Text style={styles.buttonText}>Save Username</Text>
    </TouchableOpacity>

    <TouchableOpacity onPress={() => setEditNameVisible(false)}>
      <Text style={{ color: accent, textAlign: 'center', marginTop: 8 }}>
        Cancel
      </Text>
    </TouchableOpacity>
  </>
) : (
  <TouchableOpacity
    style={[styles.settingRow, { borderColor: border }]}
    onPress={() => {
      setEditName(user?.name || '');
      setEditNameVisible(true);
    }}
  >
    <Text style={{ color: text }}>Edit Username</Text>
    <Text style={{ color: accent, fontWeight: '700' }}>Edit</Text>
  </TouchableOpacity>
)}

          <View style={[styles.settingRow, { borderColor: border }]}>
            <Text style={{ color: text }}>Dark mode</Text>
            <Switch value={darkMode} onValueChange={setDarkMode} />
          </View>

          <Text style={{ color: text, fontWeight: '700', marginTop: 20, marginBottom: 8 }}>Reset password</Text>
          {!resetVisible && (
            <TouchableOpacity style={[styles.button, { backgroundColor: accent }]} onPress={requestResetCode}>
              <Text style={styles.buttonText}>Send reset code</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
  style={[styles.button, { backgroundColor: accent }]}
  onPress={requestResetCode}
>
  <Text style={styles.buttonText}>Send Password Reset Email</Text>
</TouchableOpacity>

          <TouchableOpacity style={[styles.button, { backgroundColor: border, marginTop: 10 }]} onPress={() => setScreen('terms')}>
            <Text style={{ color: text, fontWeight: 'bold' }}>Terms & Conditions</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, { backgroundColor: '#555' }]} onPress={() => signOut(auth)}>
            <Text style={styles.buttonText}>Log out</Text>
          </TouchableOpacity>
        </ScrollView>
      )}{screen === 'ai' && (
        <View style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1, marginBottom: 8 }}>
            {aiMessages.map((m) => (
              <View key={m.id} style={{ alignItems: m.from === 'user' ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
                <View style={{ backgroundColor: m.from === 'user' ? accent : cardBg, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, maxWidth: '80%' }}>
                  <Text style={{ color: m.from === 'user' ? '#fff' : text }}>{m.text}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg, flex: 1, marginBottom: 0 }]} placeholder="Ask the Ascend Help Bot..." placeholderTextColor={subtext} value={aiDraft} onChangeText={setAiDraft} />
            <TouchableOpacity style={{ backgroundColor: accent, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' }} onPress={sendAiMessage}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
{notifOpen && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: bg, zIndex: 20, paddingTop: 60, paddingHorizontal: 16 }}>
          <TouchableOpacity onPress={async () => {
  setNotifOpen(false);

  try {
    await Promise.all(
      notifications
        .filter((n) => n.id !== 1 && !n.read)
        .map((n) =>
          updateDoc(doc(db, 'notifications', n.id), {
            read: true,
          })
        )
    );
  } catch (error) {
    console.log('Notification read error:', error);
  }
}} style={{ marginBottom: 16 }}>
            <Text style={{ color: accent, fontWeight: '700' }}>← Back</Text>
          </TouchableOpacity>
          <Text style={{ color: text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Notifications</Text>
          <ScrollView>
            {notifications.length === 0 && <Text style={{ color: subtext }}>No notifications yet.</Text>}
            {notifications.map((n) => (
              <View key={n.id} style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
                <Text style={{ color: accent, fontWeight: '700', marginBottom: 2 }}>
  {n.from || n.fromName || 'Ascend'}
</Text>

<Text style={{ color: text }}>
  {n.text ||
    (n.type === 'group_join_request'
      ? `${n.fromName} requested to join ${n.groupName}.`
      : n.type === 'group_joined'
      ? `${n.fromName} joined ${n.groupName}.`
      : n.type === 'group_join_approved'
      ? `Your request to join ${n.groupName} was approved.`
      : n.type === 'group_join_rejected'
      ? `Your request to join ${n.groupName} was rejected.`
      : 'You have a new notification.')}
</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

{createPageOpen && (
  <ScrollView style={{ flex: 1 }}>
    <TouchableOpacity onPress={() => setCreatePageOpen(false)}>
      <Text style={{ color: accent, fontWeight: '700', marginBottom: 16 }}>
        ← Back to Settings
      </Text>
    </TouchableOpacity>

    <Text style={{ color: text, fontSize: 24, fontWeight: '700', marginBottom: 20 }}>
      Create Page
    </Text>

  <TouchableOpacity
  onPress={choosePagePhoto}
  style={[styles.button, { backgroundColor: accent, marginBottom: 12 }]}
>
  <Text style={styles.buttonText}>
    Choose Page Picture
  </Text>
</TouchableOpacity>

{pagePhoto && (
  <Image
    source={{ uri: pagePhoto }}
    style={{
      width: 120,
      height: 120,
      borderRadius: 60,
      alignSelf: 'center',
      marginBottom: 16,
    }}
  />
)}

    <TextInput
      style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg }]}
      placeholder="Page name"
      placeholderTextColor={subtext}
      value={pageNameInput}
      onChangeText={setPageNameInput}
    />

    <TextInput
      style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg }]}
      placeholder="Page description"
      placeholderTextColor={subtext}
      value={pageDescriptionInput}
      onChangeText={setPageDescriptionInput}
      multiline
    />

    <TextInput
      style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg }]}
      placeholder="Page category"
      placeholderTextColor={subtext}
      value={pageCategoryInput}
      onChangeText={setPageCategoryInput}
    />

    <TouchableOpacity
      onPress={handleCreatePage}
      style={[styles.button, { backgroundColor: accent }]}
    >
      <Text style={styles.buttonText}>Create Page</Text>
    </TouchableOpacity>

    <TouchableOpacity
      onPress={() => setCreatePageOpen(false)}
      style={{ marginTop: 12, marginBottom: 20 }}
    >
      <Text style={{ color: accent, textAlign: 'center', fontWeight: '700' }}>
        Cancel
      </Text>
    </TouchableOpacity>
  </ScrollView>
)}

      {screen === 'terms' && (
        <ScrollView style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => setScreen('settings')}>
            <Text style={{ color: accent, fontWeight: '700', marginBottom: 12 }}>← Back to Settings</Text>
          </TouchableOpacity>
          <Text style={{ color: text, lineHeight: 21 }}>{TERMS_TEXT}</Text>
        </ScrollView>
      )}

  {pageProfile && (
  <ScrollView style={{ flex: 1 }}>
    <TouchableOpacity onPress={() => setPageProfile(null)}>
      <Text style={{ color: accent, fontWeight: '700', marginBottom: 16 }}>
        ← Back
      </Text>
    </TouchableOpacity>

  {pageProfile.photo ? (
  <Image
    source={{ uri: pageProfile.photo }}
    style={{
      width: 120,
      height: 120,
      borderRadius: 60,
      alignSelf: 'center',
      marginBottom: 16,
    }}
  />
) : null}

    <Text style={{ color: text, fontSize: 28, fontWeight: '700', marginBottom: 8 }}>
      {pageProfile.name}
    </Text>

    {pageProfile.Verified === true && (
  <View
    style={{
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: '#16a34a',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    }}
  >
    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>
      ✓
    </Text>
  </View>
)}

    {pageProfile.isOfficial === true && (
      <Text style={{ color: '#16a34a', fontSize: 16, fontWeight: '700', marginBottom: 8 }}>
        ✓ Official Ascend Page
      </Text>
    )}

    <Text style={{ color: subtext, marginBottom: 12 }}>
      {pageProfile.category}
    </Text>

    <Text style={{ color: text, lineHeight: 22, marginBottom: 12 }}>
      {pageProfile.description}
    </Text>

    <Text style={{ color: subtext, marginBottom: 16 }}>
      {pageProfile.followersCount || 0} followers
    </Text>

    {followedPages.includes(pageProfile.id) ? (
      <TouchableOpacity
        onPress={() => handleUnfollowPage(pageProfile.id)}
        style={[styles.button, { backgroundColor: border }]}
      >
        <Text style={[styles.buttonText, { color: text }]}>
          Following
        </Text>
      </TouchableOpacity>
    ) : (
      <TouchableOpacity
        onPress={() => handleFollowPage(pageProfile.id)}
        style={[styles.button, { backgroundColor: accent }]}
      >
        <Text style={styles.buttonText}>
          Follow
        </Text>
      </TouchableOpacity>
    )}
  </ScrollView>
)}

      <Modal visible={!!profileMenuFor} transparent animationType="fade" onRequestClose={() => setProfileMenuFor(null)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setProfileMenuFor(null)}>
          <View style={{ backgroundColor: cardBg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                <Text style={{ color: accent, fontWeight: '700', fontSize: 20 }}>{profileMenuFor?.charAt(0)}</Text>
              </View>
              <Text style={{ color: text, fontWeight: '700', fontSize: 16 }}>{profileMenuFor}</Text>
            </View>
            <TouchableOpacity style={[styles.button, { backgroundColor: bg }]} onPress={() => openProfile(profileMenuFor)}>
              <Text style={{ color: text, fontWeight: 'bold' }}>View Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, { backgroundColor: accent }]} onPress={() => messagePerson(profileMenuFor)}>
              <Text style={styles.buttonText}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, { backgroundColor: '#555' }]} onPress={() => blockPerson(profileMenuFor)}>
              <Text style={styles.buttonText}>Block</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, { backgroundColor: '#C2403F' }]} onPress={() => reportPerson(profileMenuFor)}>
              <Text style={styles.buttonText}>Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 6 }} onPress={() => setProfileMenuFor(null)}>
              <Text style={{ color: subtext, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!viewProfileFor} transparent animationType="fade" onRequestClose={() => setViewProfileFor(null)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }} activeOpacity={1} onPress={() => setViewProfileFor(null)}>
          <View style={{ backgroundColor: cardBg, borderRadius: 16, padding: 20 }}>
            <View style={{ alignItems: 'center', marginBottom: 10 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                {viewProfileData?.photo ? (
  <Image
    source={{ uri: viewProfileData.photo }}
    style={{ width: 64, height: 64, borderRadius: 32 }}
  />
) : (
  <Text style={{ color: accent, fontWeight: '700', fontSize: 22 }}>
    {viewProfileData?.name?.charAt(0) || viewProfileFor?.charAt(0)}
  </Text>
)}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
  <Text style={{ color: text, fontWeight: '700', fontSize: 18 }}>
    {viewProfileData?.name || viewProfileFor}
  </Text>

  {viewProfileData?.Verified === true && (
    <View style={{
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: '#16a34a',
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 6,
    }}>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>
    </View>
  )}
</View>
              {viewProfileData && (
  <>
    <Text style={{ color: subtext, fontSize: 13, marginTop: 4 }}>
      {viewProfileData.location || ''}
    </Text>

    {viewProfileData.bio && (
      <Text style={{ color: text, marginTop: 10, textAlign: 'center' }}>
        {viewProfileData.bio}
      </Text>
    )}
  </>
)}
            </View>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 10 }} onPress={() => setViewProfileFor(null)}>
              <Text style={{ color: accent, fontWeight: '700' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={[styles.nav, { borderColor: border }]}>
        {['feed', 'reels', 'chat', 'ranks', 'ai', 'profile'].map((s) => (
          <TouchableOpacity key={s} style={styles.navItem} onPress={() => { setScreen(s); if (s !== 'chat') setActiveChatId(null); }}>
            <Text style={{ color: screen === s ? accent : subtext, fontWeight: '700', fontSize: 10 }}>{s === 'ai' ? 'HELP' : s.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ color: subtext, textAlign: 'center', fontSize: 10.5, paddingBottom: 6 }}>Ascend from MIDEON</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, paddingTop: 60, paddingHorizontal: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold' },
  input: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
  button: { padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  smallButton: { padding: 8, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  rankRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  nav: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, paddingVertical: 10 },
});
