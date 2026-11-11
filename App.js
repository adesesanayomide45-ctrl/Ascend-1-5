import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Switch, Image, Alert, Modal , ActivityIndicator, BackHandler, RefreshControl } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { RewardedAd, RewardedAdEventType, AdEventType, BannerAd, BannerAdSize, TestIds, initializeAds } from './adsService';
import { auth, db, storage } from './firebaseConfig';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Linking, Share, Platform } from 'react-native';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, onAuthStateChanged, signOut, verifyBeforeUpdateEmail, deleteUser, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, setDoc, getDocs, where, updateDoc, deleteDoc, arrayUnion, arrayRemove, increment, getDoc, writeBatch, limit } from 'firebase/firestore';

// Keep this true until your real AdMob APP ID is in app.json (the ca-app-pub-...~... one).
// Then set it to false so real ads (and real earnings) are used.
const USE_TEST_ADS = true;

const REWARDED_AD_UNIT_ID =
  __DEV__ || USE_TEST_ADS
    ? TestIds.REWARDED
    : 'ca-app-pub-8423402489636119/2810513971';

let rewardedAd = null;
try {
  rewardedAd = RewardedAd.createForAdRequest(REWARDED_AD_UNIT_ID);
} catch (error) {
  console.log('Rewarded ads unavailable:', error);
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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

By creating an account, you agree to these terms.`;

const BLOCKED_WORDS = ['bitch', 'asshole'];


function getBotReply(q) {
  const t = q.toLowerCase();
  if (t.includes('nude') || t.includes('naked') || t.includes('nsfw')) return "Nudity and sexually explicit content are strictly prohibited on Ascend. Accounts posting this can face severe punishment, including suspension or a permanent ban.";
  if (t.includes('swear') || t.includes('curse') || t.includes('offensive') || t.includes('slur') || t.includes('hate speech') || t.includes('racist')) return "Hate speech, slurs, and offensive language directed at people or groups aren't allowed on Ascend. This can be reported, and confirmed violations can lead to serious consequences, including a ban.";
  if (t.includes('ban') || t.includes('punish')) return "If an account is found to have truly violated our terms, it can face serious punishment, including suspension or a permanent ban — on top of the usual point penalty.";
  if (t.includes('terms') || t.includes('rule')) return TERMS_TEXT;
  if (t.includes('reel') || t.includes('video')) return "Tap the Reels tab to watch videos people have posted. You can attach your own with the 📎 Photo / Video button on the Feed screen.";
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
}

function AscendVideoPlayer({ uri, height = 220, radius = 12 }) {
  const player = useVideoPlayer(
  uri,
  (player) => {
    player.loop = false;
  },
  {
    seekBackwardIncrement: 10,
    seekForwardIncrement: 10,
  }
);

  return (
    <VideoView
      player={player}
      style={{
        width: '100%',
        height,
        borderRadius: radius,
      }}
      nativeControls
    />
  );
}

// Firestore listener wrapper: logs listener errors (e.g. permission-denied) and
// stops a bug inside a callback from crashing the whole app.
function safeOnSnapshot(q, onNext) {
  return onSnapshot(
    q,
    (snapshot) => {
      try {
        onNext(snapshot);
      } catch (error) {
        console.log('Snapshot handler error:', error);
      }
    },
    (error) => {
      console.log('Listener error:', error && error.code, error && error.message);
      if (!listenerErrorShown) {
        listenerErrorShown = true;
        Alert.alert(
          'Could not load data',
          `${(error && error.code) || 'error'}: ${(error && error.message) || ''}\n\nIf this says permission-denied, your Firebase rules are blocking the app.`
        );
      }
    }
  );
}

let listenerErrorShown = false;

// Saves the push token in the background so login never waits for it.
async function saveNotificationToken(userDocId) {
  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    if (tokenResponse && tokenResponse.data) {
      await updateDoc(doc(db, 'users', userDocId), { notificationToken: tokenResponse.data });
    }
  } catch (error) {
    console.log('Could not save notification token:', error);
  }
}

// Paste your real "Banner" ad unit ID from AdMob here (AdMob > Apps > Ascend > Ad units > Add ad unit > Banner).
const BANNER_AD_UNIT_ID = '';

function AdBanner() {
  const [failed, setFailed] = useState(false);
  const unitId = __DEV__ || USE_TEST_ADS ? TestIds.BANNER : BANNER_AD_UNIT_ID;
  if (!unitId || failed || Platform.OS === 'web') return null;
  return (
    <View style={{ alignItems: 'center', marginBottom: 12 }}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.MEDIUM_RECTANGLE}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

// Small round profile picture. Falls back to the first letter of the name.
const photoCache = {};
const photoPending = {};

function Avatar({ uid, name, photo, size = 32, bg = '#e5e7eb', color = '#1E8449', style }) {
  const [url, setUrl] = useState(photo || (uid && photoCache[uid]) || null);

  useEffect(() => {
    if (photo) {
      setUrl(photo);
      return undefined;
    }
    if (!uid) {
      setUrl(null);
      return undefined;
    }
    if (photoCache[uid] !== undefined) {
      setUrl(photoCache[uid]);
      return undefined;
    }
    let alive = true;
    if (!photoPending[uid]) {
      photoPending[uid] = getDoc(doc(db, 'users', uid))
        .then((snap) => (snap.exists() ? snap.data().photo || null : null))
        .catch(() => undefined);
    }
    photoPending[uid].then((result) => {
      if (result !== undefined) photoCache[uid] = result;
      delete photoPending[uid];
      if (alive) setUrl(result || null);
    });
    return () => {
      alive = false;
    };
  }, [uid, photo]);

  const radius = size / 2;
  const base = { width: size, height: size, borderRadius: radius, overflow: 'hidden' };

  if (url) {
    return <Image source={{ uri: url }} style={[base, { backgroundColor: bg }, style]} />;
  }
  return (
    <View style={[base, { backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ color, fontWeight: '700', fontSize: Math.max(11, size * 0.42) }}>
        {((name || '?').trim().charAt(0) || '?').toUpperCase()}
      </Text>
    </View>
  );
}

// Today's date in the phone's own time zone, like 2026-11-08. A new day starts at local midnight.
function todayKey() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// Pages disappear after this many hours. Set to 0 to keep pages forever.
const PAGE_LIFETIME_HOURS = 24;

function notExpired(page) {
  return !page.expiresAtMs || page.expiresAtMs > Date.now();
}

// Puts an ad slot after every `every` items (and one at the end of a short list).
function withAds(list, every) {
  const out = [];
  list.forEach((item, i) => {
    out.push(item);
    if ((i + 1) % every === 0) out.push({ id: `ad-${i}`, isAd: true });
  });
  if (list.length > 0 && list.length < every) out.push({ id: 'ad-end', isAd: true });
  return out;
}

// Free photo and video hosting (Cloudinary). Put your two values here.
const CLOUDINARY_CLOUD_NAME = 'YOUR_CLOUD_NAME';
const CLOUDINARY_UPLOAD_PRESET = 'YOUR_UPLOAD_PRESET';

// Uploads a photo or video and returns its web address.
async function uploadToCloudinary(fileUri, kind, folder) {
  if (
    !CLOUDINARY_CLOUD_NAME ||
    CLOUDINARY_CLOUD_NAME === 'YOUR_CLOUD_NAME' ||
    !CLOUDINARY_UPLOAD_PRESET ||
    CLOUDINARY_UPLOAD_PRESET === 'YOUR_UPLOAD_PRESET'
  ) {
    throw new Error('Photo and video uploads are not set up yet.');
  }

  const resourceType = kind === 'video' ? 'video' : 'image';
  const form = new FormData();

  if (Platform.OS === 'web') {
    const fileResponse = await fetch(fileUri);
    form.append('file', await fileResponse.blob());
  } else {
    const cleanUri = String(fileUri).split('?')[0].toLowerCase();
    const guessedExt = cleanUri.includes('.') ? cleanUri.split('.').pop() : '';
    let ext = guessedExt && guessedExt.length <= 4 ? guessedExt : resourceType === 'video' ? 'mp4' : 'jpg';
    const mime =
      resourceType === 'video'
        ? `video/${ext === 'mov' ? 'quicktime' : ext}`
        : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    form.append('file', { uri: fileUri, name: `upload.${ext}`, type: mime });
  }

  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  if (folder) form.append('folder', folder);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    { method: 'POST', body: form }
  );
  const data = await response.json();

  if (!response.ok || !data.secure_url) {
    throw new Error((data && data.error && data.error.message) || 'Upload failed. Please try again.');
  }
  return data.secure_url;
}

// Keep this the same as "version" in app.json. Raise both for every new release.
const APP_VERSION = '1.0.0';

// Your privacy policy web address (Google Play asks for one). Paste the link here.
const PRIVACY_POLICY_URL = '';

// Link people are sent to when they tap "Update now" (your Google Play link).
const UPDATE_URL_FALLBACK = '';

function isNewerVersion(latest, current) {
  const a = String(latest || '').split('.').map((n) => parseInt(n, 10) || 0);
  const b = String(current || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

// "now", "5m", "3h", "2d" ... like Facebook.
function timeAgo(ts) {
  const ms =
    ts && typeof ts.toMillis === 'function'
      ? ts.toMillis()
      : typeof ts === 'number'
      ? ts
      : null;
  if (!ms) return 'now';
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return `${Math.floor(days / 30)}mo`;
}

const STORY_COLORS = ['#1E8449', '#2563eb', '#c2410c', '#7c3aed', '#be185d', '#0e7490'];

// Saved accounts (for quick switching). The list is stored normally; each
// password is stored encrypted in the phone's secure storage.
const SAVED_ACCOUNTS_KEY = 'ascend_saved_accounts_v1';

async function loadSavedAccounts() {
  try {
    const raw = await AsyncStorage.getItem(SAVED_ACCOUNTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

async function storeSavedAccounts(list) {
  try {
    await AsyncStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(list));
  } catch (error) {
    console.log('Could not save the account list:', error);
  }
}

async function getSavedPassword(uid) {
  try {
    return await SecureStore.getItemAsync(`ascend_pw_${uid}`);
  } catch (error) {
    return null;
  }
}

async function setSavedPassword(uid, password) {
  await SecureStore.setItemAsync(`ascend_pw_${uid}`, password);
}

async function deleteSavedPassword(uid) {
  try {
    await SecureStore.deleteItemAsync(`ascend_pw_${uid}`);
  } catch (error) {
    // ignore
  }
}

// Green version of Facebook's verified seal
function VerifiedBadge({ size = 18 }) {
  return <MaterialIcons name="verified" size={size} color="#16a34a" style={{ marginLeft: 4 }} />;
}

// Story background colours
const STORY_BGS = ['#1E8449', '#2563eb', '#c2410c', '#7c3aed', '#be185d', '#0e7490', '#111827'];

// Sends a phone notification to another person (needs their saved push token)
async function sendPushTo(toUid, title, body, data) {
  try {
    if (!toUid) return;
    const snap = await getDoc(doc(db, 'users', toUid));
    const token = snap.exists() ? snap.data().notificationToken : null;
    if (!token) return;
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: token, title, body, sound: 'default', channelId: 'default', data: data || {} }),
    });
  } catch (error) {
    console.log('Push send failed:', error);
  }
}

// Returns true when the internet is reachable, false otherwise.
async function checkConnection() {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  let timer;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 6000);
    await fetch('https://www.gstatic.com/generate_204', {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch (error) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default function App() {
  useEffect(() => {
  const requestNotificationPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
        });
      }
      const { status } = await Notifications.requestPermissionsAsync();

      if (status !== 'granted') {
        console.log('Notification permission not granted');
      }
    } catch (error) {
      console.log('Notification permission unavailable:', error);
    }
  };

  requestNotificationPermission();
}, []);
  
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

  const [screen, setScreenState] = useState('feed');
  const screenRef = useRef('feed');
  const historyRef = useRef([]);
  const backStateRef = useRef({});
  const requestNotifiedRef = useRef({});

  // Every screen change is remembered so the Back button can go back one step
  const setScreen = (next) => {
    const current = screenRef.current;
    if (next === current) return;
    historyRef.current.push(current);
    if (historyRef.current.length > 30) historyRef.current.shift();
    screenRef.current = next;
    setScreenState(next);
  };

  // Bottom tabs start a fresh history, like Facebook
  const goTab = (next) => {
    historyRef.current = [];
    screenRef.current = next;
    setScreenState(next);
  };

  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [messengerTab, setMessengerTab] = useState('chats');
  const [notifTab, setNotifTab] = useState('all');
  const [inboxChats, setInboxChats] = useState([]);
  const [messageRequests, setMessageRequests] = useState([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [adError, setAdError] = useState('');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [editPhone, setEditPhone] = useState('');
  const [editPhoneVisible, setEditPhoneVisible] = useState(false);
  const [editEmail, setEditEmail] = useState('');
  const [editEmailVisible, setEditEmailVisible] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [stories, setStories] = useState([]);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [storyText, setStoryText] = useState('');
  const [storyBgIndex, setStoryBgIndex] = useState(0);
  const [storyMedia, setStoryMedia] = useState(null);
  const [storyMusic, setStoryMusic] = useState('');
  const [storyPosting, setStoryPosting] = useState(false);
  const [storyViewer, setStoryViewer] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [friendsTab, setFriendsTab] = useState('suggestions');
  const [sentRequestIds, setSentRequestIds] = useState([]);
  const [removedSuggestionIds, setRemovedSuggestionIds] = useState([]);
  const [profileTab, setProfileTab] = useState('all');
  const storyGroupsRef = useRef([]);
  const notificationsRef = useRef([]);
  const lastPasswordRef = useRef('');
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [saveAccountOpen, setSaveAccountOpen] = useState(false);
  const [saveThenLogout, setSaveThenLogout] = useState(false);
  const [savePasswordInput, setSavePasswordInput] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [switchAccountOpen, setSwitchAccountOpen] = useState(false);
  const [switchingUid, setSwitchingUid] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [hiddenPostIds, setHiddenPostIds] = useState([]);

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

  const [rewardedAdLoaded, setRewardedAdLoaded] = useState(false);
  const [adsWatchedToday, setAdsWatchedToday] = useState(0);
  const [rewardedAdDate, setRewardedAdDate] = useState('');
  
  const [darkMode, setDarkMode] = useState(false);
  
  const [draft, setDraft] = useState('');
  const [draftMedia, setDraftMedia] = useState(null);
  const [friends, setFriends] = useState([])
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [profileMenuFor, setProfileMenuFor] = useState(null);const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [viewProfileFor, setViewProfileFor] = useState(null);
  const [viewProfileData, setViewProfileData] = useState(null);
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
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editLocation, setEditLocation] = useState('');

  const bg = darkMode ? '#141119' : '#f0f2ee';
  const cardBg = darkMode ? '#1c1f16' : '#ffffff';
  const text = darkMode ? '#f0f0f0' : '#161b15';
  const subtext = darkMode ? '#9aa393' : '#657160';
  const accent = '#1E8449';
  const border = darkMode ? '#2a3020' : '#e1e8dc';const [appReady, setAppReady] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingDots, setLoadingDots] = useState('.');
  const [connection, setConnection] = useState('checking'); // 'checking' | 'online' | 'offline'
  const [authAttempt, setAuthAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);

  const connectionRef = useRef('checking');

  const applyConnection = (ok) => {
    const previous = connectionRef.current;
    const next = ok ? 'online' : 'offline';
    connectionRef.current = next;
    setConnection(next);
    // Back online after being offline: re-run the login restore.
    if (ok && previous === 'offline') setAuthAttempt((n) => n + 1);
  };

  const retryConnection = async () => {
    setRetrying(true);
    applyConnection(await checkConnection());
    setRetrying(false);
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const ok = await checkConnection();
      if (cancelled) return;
      applyConnection(ok);
    };

    run();
    const interval = setInterval(run, 8000);

    let onOnline;
    let onOffline;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      onOnline = () => run();
      onOffline = () => applyConnection(false);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
    }

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (onOnline) window.removeEventListener('online', onOnline);
      if (onOffline) window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Asks Firebase (config/app) if a newer version of the app exists.
  useEffect(() => {
    if (connection !== 'online' || !user?.uid) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'app'));
        if (cancelled || !snap.exists()) return;
        const info = snap.data();
        if (isNewerVersion(info.latestVersion, APP_VERSION)) {
          setUpdateInfo({
            latest: info.latestVersion,
            url: info.updateUrl || UPDATE_URL_FALLBACK,
            message: info.message || 'A new version of Ascend is available.',
            force: !!info.minVersion && isNewerVersion(info.minVersion, APP_VERSION),
          });
        }
      } catch (error) {
        console.log('Update check failed:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, user?.uid]);

  // Android Back button: close things, go back a screen, only leave the app from Home
  useEffect(() => {
    const onBack = () => {
      const b = backStateRef.current;
      if (b.composerOpen) {
        setComposerOpen(false);
        return true;
      }
      if (b.notifOpen) {
        setNotifOpen(false);
        return true;
      }
      if (b.activePrivateFriend) {
        setActivePrivateFriend(null);
        return true;
      }
      if (b.activeGroup) {
        setActiveGroup(null);
        return true;
      }
      if (b.groupChatOpen) {
        setGroupChatOpen(false);
        return true;
      }
      if (b.creatingGroup) {
        setCreatingGroup(false);
        return true;
      }
      if (b.screen && b.screen !== 'feed') {
        const previous = historyRef.current.pop();
        const target = previous && previous !== b.screen ? previous : 'feed';
        screenRef.current = target;
        setScreenState(target);
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => subscription.remove();
  }, []);

  // Load the accounts saved on this phone
  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await loadSavedAccounts();
      if (alive) setSavedAccounts(list);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Stories (last 24 hours)
  useEffect(() => {
    if (!user?.uid) return undefined;
    const q = query(collection(db, 'stories'), orderBy('createdAt', 'desc'));
    const unsubscribe = safeOnSnapshot(q, (snapshot) => {
      const now = Date.now();
      setStories(
        snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((st) => !st.expiresAtMs || st.expiresAtMs > now)
      );
    });
    return () => unsubscribe();
  }, [user?.uid, refreshKey]);

  // Moves the story viewer to the next story after a few seconds
  useEffect(() => {
    if (!storyViewer) return undefined;
    const timer = setTimeout(() => {
      setStoryViewer((current) => {
        if (!current) return null;
        const group = storyGroupsRef.current.find((g) => g.uid === current.uid);
        if (!group) return null;
        return current.index + 1 < group.items.length ? { ...current, index: current.index + 1 } : null;
      });
    }, 6000);
    return () => clearTimeout(timer);
  }, [storyViewer]);

  // People you may know
  useEffect(() => {
    if (screen !== 'friends' || !user?.uid) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), limit(40)));
        if (cancelled) return;
        setSuggestions(
          snap.docs
            .map((d) => ({ uid: d.data().uid || d.id, name: d.data().name, photo: d.data().photo }))
            .filter((u) => u.uid && u.name)
        );
      } catch (error) {
        console.log('Suggestions failed:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [screen, user?.uid, refreshKey]);

  // Marks notifications as read when you leave the Notifications screen
  useEffect(() => {
    if (screen !== 'notifications') return undefined;
    return () => {
      Promise.all(
        notificationsRef.current
          .filter((n) => n.id !== 1 && !n.read)
          .map((n) => updateDoc(doc(db, 'notifications', n.id), { read: true }))
      ).catch((error) => console.log('Notification read error:', error));
    };
  }, [screen]);

  useEffect(() => {
  const interval = setInterval(() => {
    setLoadingDots((dots) =>
      dots === '.' ? '..' : dots === '..' ? '...' : '.'
    );
  }, 500);

  return () => clearInterval(interval);
}, []);

  useEffect(() => {
  return () => {};
}, []);

  useEffect(() => {
    if (!rewardedAd) return undefined;

    let retryTimer = null;
    const unsubscribers = [];

    try {
      unsubscribers.push(
        rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
          setRewardedAdLoaded(true);
          setAdError('');
        })
      );

      unsubscribers.push(
        rewardedAd.addAdEventListener(AdEventType.ERROR, (error) => {
          console.log('Rewarded ad error:', error);
          setRewardedAdLoaded(false);
          setAdError(`${(error && error.code) || ''} ${(error && error.message) || ''}`.trim());
          // Try again in 30 seconds
          clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {
            try {
              rewardedAd.load();
            } catch (loadError) {
              console.log('Rewarded ad reload failed:', loadError);
            }
          }, 30000);
        })
      );

      unsubscribers.push(
        rewardedAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, async () => {
          if (!user?.uid) return;

          try {
            const todayDate = todayKey();
            const userRef = doc(db, 'users', user.uid);
            const userSnapshot = await getDoc(userRef);

            if (!userSnapshot.exists()) return;

            const userData = userSnapshot.data();
            const savedAdDate = userData.rewardedAdDate || '';
            const savedAdsWatched = Number(userData.adsWatchedToday || 0);

            // Reset the counter when a new day starts
            const currentAdsWatched = savedAdDate === todayDate ? savedAdsWatched : 0;

            if (currentAdsWatched >= 20) {
              Alert.alert('Daily limit reached', 'You have reached the maximum of 20 rewarded ads today.');
              return;
            }

            const newAdsWatched = currentAdsWatched + 1;

            await updateDoc(userRef, {
              points: increment(5),
              adsWatchedToday: newAdsWatched,
              rewardedAdDate: todayDate,
            });

            setPoints((prev) => prev + 5);
            setAdsWatchedToday(newAdsWatched);
            setRewardedAdDate(todayDate);

            Alert.alert('Reward earned! 🎉', 'You received +5 Ascend Points!');
          } catch (error) {
            Alert.alert('Reward error', 'Your points could not be added. Please try again.');
          }
        })
      );

      // CLOSED belongs to AdEventType (RewardedAdEventType has no CLOSED).
      unsubscribers.push(
        rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
          setRewardedAdLoaded(false);
          try {
            rewardedAd.load();
          } catch (loadError) {
            console.log('Rewarded ad reload failed:', loadError);
          }
        })
      );

      // The ads SDK must finish starting before the first ad is requested.
      Promise.resolve(initializeAds()).then(() => {
        try {
          rewardedAd.load();
        } catch (loadError) {
          console.log('Rewarded ad load failed:', loadError);
          setAdError(String((loadError && loadError.message) || loadError));
        }
      });
    } catch (error) {
      console.log('Rewarded ad setup failed:', error);
      setAdError(String((error && error.message) || error));
    }

    return () => {
      clearTimeout(retryTimer);
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch (error) {
          // ignore
        }
      });
    };
  }, [user?.uid]);
  
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
      const todayDate = todayKey();

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

        const savedRewardedAdDate = userData.rewardedAdDate || '';

const savedAdsWatched = Number(
  userData.adsWatchedToday || 0
);

const currentAdsWatched =
  savedRewardedAdDate === todayDate
    ? savedAdsWatched
    : 0;

setAdsWatchedToday(currentAdsWatched);
setRewardedAdDate(todayDate);

        let newPoints = currentPoints;
        let dailyNote = '';

        if (!lastLogin) {
          newPoints = currentPoints + 40;
          dailyNote = 'Daily login reward: +40 points!';
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

          dailyNote =
            missedDays > 0
              ? `Daily login reward: +40 points.\nYou missed ${missedDays} day${missedDays > 1 ? 's' : ''}: -${missedDays * 20} points.`
              : 'Daily login reward: +40 points!';
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

        saveNotificationToken(userDoc.id);
        if (dailyNote) Alert.alert('Daily login', dailyNote);
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
  saveNotificationToken(firebaseUser.uid);
      }
    } catch (error) {
      console.log('Auth restore error:', error);
      setUser(null);
    } finally {
      setAppReady(true);
      setAuthLoading(false);
    }
  });

  return () => unsubscribe();
}, [authAttempt]);
  
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

  const unsubscribe = safeOnSnapshot(q, (snapshot) => {
    const realNotifications = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    setNotifications(realNotifications);
  });

  return () => unsubscribe();
}, [user?.uid, refreshKey]);
  
  useEffect(() => {
    if (!user || !user.uid) return;
    const q = query(collection(db, 'friendRequests'), where('toUid', '==', user.uid), where('status', '==', 'pending'));
    const unsubscribe = safeOnSnapshot(q, (snapshot) => {
      const reqs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setIncomingRequests(reqs);
    });
    return () => unsubscribe();
  }, [user?.uid, refreshKey]);

  useEffect(() => {
    if (!user || !user.uid) return;
    const q = query(collection(db, 'privateChats'), where('members', 'array-contains', user.uid));
    const unsubscribe = safeOnSnapshot(q, (snapshot) => {
      const list = snapshot.docs
        .map((d) => {
          const data = d.data();
          const members = Array.isArray(data.members) ? data.members : [];
          const otherUid = members.find((m) => m !== user.uid);
          if (!otherUid) return null;
          return {
            chatId: d.id,
            uid: otherUid,
            name: (data.memberNames || {})[otherUid] || 'User',
            lastMessage: data.lastMessage || '',
            lastMessageAt: data.lastMessageAt || null,
            lastSenderUid: data.lastSenderUid || '',
            isFriend: data.isFriend !== false,
            status: data.status || 'active',
            requesterUid: data.requesterUid || '',
            requestNotified: data.requestNotified === true,
          };
        })
        .filter(Boolean);
      const friendsOnly = list.filter((c) => c.isFriend);
      setRealFriends(friendsOnly);
      setFriends(friendsOnly.map((friend) => friend.name));
      setInboxChats(list.filter((c) => c.status !== 'declined' && (c.status !== 'request' || c.requesterUid === user.uid)));
      setMessageRequests(list.filter((c) => c.status === 'request' && c.requesterUid !== user.uid));
    });
    return () => unsubscribe();
  }, [user?.uid, refreshKey]);

  useEffect(() => {
    if (!user || !activePrivateFriend) return;
    const chatId = [user.uid, activePrivateFriend.uid].sort().join('_');
    const q = query(collection(db, 'privateChats', chatId, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = safeOnSnapshot(q, (snapshot) => {
      setPrivateMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, [activePrivateFriend, user?.uid, refreshKey]);
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'posts'), orderBy('timestamp', 'desc'));
    const unsubscribe = safeOnSnapshot(q, (snapshot) => {
      setUserPosts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, [user?.uid, refreshKey]);useEffect(() => {
    if (!user || !user.uid) return;
    const q = query(collection(db, 'groups'), where('members', 'array-contains', user.uid));
    const unsubscribe = safeOnSnapshot(q, (snapshot) => {
      setGroups(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, [user?.uid, refreshKey]);

    useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'pages'), orderBy('createdAt', 'desc'));

    const unsubscribe = safeOnSnapshot(q, (snapshot) => {
      setPages(
        snapshot.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
          }))
          .filter(notExpired)
      );
    });

    return () => unsubscribe();
  }, [user?.uid, refreshKey]);

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

  const unsubscribe = safeOnSnapshot(q, (snapshot) => {
    setFollowedPages(
      snapshot.docs.map((d) => d.data().pageId)
    );
  });

  return () => unsubscribe();
}, [user?.uid, refreshKey]);

  useEffect(() => {
    if (!activeGroup) return;
    const q = query(collection(db, 'groups', activeGroup.id, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = safeOnSnapshot(q, (snapshot) => {
      setGroupMsgs(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, [activeGroup, refreshKey]);

  useEffect(() => {
  if (!user?.uid) return;

  const q = query(
    collection(db, 'groupJoinRequests'),
    where('status', '==', 'pending')
  );

  const unsubscribe = safeOnSnapshot(q, (snapshot) => {
    const requests = snapshot.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      .filter((request) => request.ownerUid === user.uid);

    setGroupJoinRequests(requests);
  });

  return () => unsubscribe();
}, [user?.uid, refreshKey]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'familyChat'), orderBy('timestamp', 'asc'));
    const unsubscribe = safeOnSnapshot(q, (snapshot) => {
      setGroupMessages(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user, refreshKey]);

  const rank = getRank(points);
  const idx = LEVELS.findIndex((l) => l === rank);
  const next = LEVELS[idx + 1];
  const combinedPosts = userPosts.map((p) => ({
  ...p,
  media: p.hasMedia
    ? {
        uri: p.mediaUrl || null,
        type: p.mediaType,
      }
    : null,
}));
  const visiblePosts = combinedPosts.filter(
  (p) =>
    !blockedUsers.includes(p.author) &&
    p.postType !== 'video'
);
  
  const profilePosts = combinedPosts.filter(
    (p) =>
      !!viewProfileFor &&
      ((viewProfileData?.uid && p.authorUid === viewProfileData.uid) ||
        p.author === viewProfileFor)
  );
  const profileRank = getRank(Number(viewProfileData?.points || 0));

  const reelPosts = combinedPosts.filter(
  (p) =>
    !blockedUsers.includes(p.author) &&
    p.postType === 'reel'
);

const videoPosts = combinedPosts.filter(
  (p) =>
    !blockedUsers.includes(p.author) &&
    p.postType === 'video'
);

  const feedPosts = visiblePosts.filter((p) => !hiddenPostIds.includes(p.id));
  const feedItems = (() => {
    const out = withAds(feedPosts, 4);
    if (reelPosts.length > 0) {
      out.splice(Math.min(2, out.length), 0, { id: 'reels-block', isReels: true });
    }
    return out;
  })();
  const circleStyle = { width: 40, height: 40, borderRadius: 20, backgroundColor: darkMode ? '#2a2730' : '#e4e6eb', alignItems: 'center', justifyContent: 'center' };
  const pillBg = darkMode ? '#2a2730' : '#f0f2f5';
  const unreadCount = notifications.filter((n) => !n.read).length;
  notificationsRef.current = notifications;
  backStateRef.current = {
    screen,
    composerOpen,
    notifOpen,
    activePrivateFriend,
    activeGroup,
    groupChatOpen,
    creatingGroup,
  };

  const storyGroups = (() => {
    const map = {};
    stories.forEach((st) => {
      if (!st.authorUid) return;
      (map[st.authorUid] = map[st.authorUid] || []).push(st);
    });
    return Object.keys(map).map((uid) => ({
      uid,
      name: map[uid][0].authorName || 'User',
      items: map[uid].slice().sort((a, b) => (a.expiresAtMs || 0) - (b.expiresAtMs || 0)),
    }));
  })();
  storyGroupsRef.current = storyGroups;

  const myPosts = combinedPosts.filter((p) => (p.authorUid ? p.authorUid === user.uid : p.author === user.name));
  const myOfficialPage = pages.find((pg) => pg.id === user.uid);
  const startMessageRequest = (target) => {
    const chatId = [user.uid, target.uid].sort().join('_');
    const existing = inboxChats.find((c) => c.chatId === chatId);
    setViewProfileFor(null);
    if (existing) {
      openPrivateChat(existing);
      return;
    }
    if (messageRequests.some((c) => c.chatId === chatId)) {
      setMessengerTab('requests');
      setScreen('chat');
      return;
    }
    openPrivateChat({
      chatId,
      uid: target.uid,
      name: target.name,
      isFriend: false,
      status: 'request',
      requesterUid: user.uid,
      pendingCreate: true,
    });
  };

  const acceptMessageRequest = async (chat) => {
    try {
      await updateDoc(doc(db, 'privateChats', chat.chatId), { status: 'active', acceptedAt: serverTimestamp() });
      await addDoc(collection(db, 'notifications'), {
        recipientUid: chat.uid,
        from: user.name,
        fromUid: user.uid,
        text: `${user.name} accepted your message request.`,
        type: 'message_request_accepted',
        read: false,
        createdAt: serverTimestamp(),
      });
      sendPushTo(chat.uid, 'Message request accepted', `${user.name} accepted your message request.`, { type: 'message_accepted' });
    } catch (error) {
      Alert.alert('Failed', error.message);
    }
  };

  const declineMessageRequest = async (chat) => {
    try {
      await updateDoc(doc(db, 'privateChats', chat.chatId), { status: 'declined' });
    } catch (error) {
      Alert.alert('Failed', error.message);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} colors={[accent]} />
  );

  const openEditProfile = () => {
    setEditBio(user.bio || '');
    setEditAge(user.age ? String(user.age) : '');
    setEditGender(user.gender || '');
    setEditLocation(user.location || '');
    setEditProfileVisible(true);
  };
  
  const pickMedia = async (mediaMode = 'all') => {
  try {
  const mediaTypes =
    mediaMode === 'photo'
      ? ['images']
      : ['videos'];

  const result =
    await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      quality: 0.7,
    });

  if (!result.canceled) {
    const asset = result.assets[0];

    const durationInSeconds =
      asset.duration ? asset.duration / 1000 : 0;

    if (mediaMode === 'reel' && durationInSeconds > 180) {
      Alert.alert(
        'Video too long for a Reel',
        'Reels can be up to 3 minutes. Please shorten your video or upload it as a Video.'
      );
      return;
    }

    if (mediaMode === 'video' && durationInSeconds > 1200) {
      Alert.alert(
        'Video too long',
        'Videos can be up to 20 minutes. Please shorten your video.'
      );
      return;
    }

    setDraftMedia({
      uri: asset.uri,
      type: asset.type,
      postType:
        mediaMode === 'reel'
          ? 'reel'
          : mediaMode === 'video'
          ? 'video'
          : 'photo',
    });
  }
  } catch (error) {
    Alert.alert('Could not open media', error.message);
  }
};

  const pickSignupPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (!result.canceled) setSignupPhoto(result.assets[0].uri);
    } catch (error) {
      Alert.alert('Could not open photos', error.message);
    }
  };

  const pickProfileImage = async () => {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });

    if (result.canceled) return;

    const imageUri = result.assets[0].uri;

    const photoUrl = await uploadToCloudinary(imageUri, 'image', 'profilePictures');

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
    Alert.alert('Official posts not saved', `${(error && error.code) || 'error'}: ${(error && error.message) || ''}`);
  }
};

useEffect(() => {
  if (user?.uid && user.isOfficial === true) {
    seedAscendOfficialPosts();
  }
}, [user?.uid, user?.isOfficial]);

  const addPost = async () => {
    if (posting) return;
    if (!draft.trim() && !draftMedia) return;
    if (BLOCKED_WORDS.some((w) => draft.toLowerCase().replace(/[^a-z]/g, '').includes(w))) {
      Alert.alert('Post blocked', 'Your post contains language that violates our content policy. Please edit it before posting.');
      return;
    }
    setPosting(true);
    try {
      let mediaUrl = null;
      if (draftMedia) {
        mediaUrl = await uploadToCloudinary(
          draftMedia.uri,
          draftMedia.type === 'video' ? 'video' : 'image',
          'posts'
        );
      }
      await addDoc(collection(db, 'posts'), {
        author: user.name,
        authorUid: user.uid || null,
        verified: user.Verified === true,
        isOfficial: user.isOfficial === true,
        text: draft,
        hasMedia: !!draftMedia,
        mediaType: draftMedia ? draftMedia.type : null,
        postType: draftMedia ? draftMedia.postType : 'text',
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
    } finally {
      setPosting(false);
    }
  };

  const watchRewardedAd = () => {
    Alert.alert(
      'Watch an Ad',
      'Watch a short ad to earn +5 Ascend Points.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Watch',
          onPress: () => {
            if (!rewardedAdLoaded) {
              // Ask for a fresh ad and tell the person why it is not ready.
              try {
                rewardedAd?.load();
              } catch (loadError) {
                // ignore
              }
              Alert.alert(
                'Ad not ready',
                adError
                  ? `The ad could not load yet. Please try again in a moment.\n\n${adError}`
                  : 'The ad is still loading. Please try again in a few seconds.'
              );
              return;
            }

            if (adsWatchedToday >= 20) {
              Alert.alert(
                'Daily limit reached',
                'You have reached the maximum of 20 rewarded ads today.'
              );
              return;
            }

            try {
              rewardedAd?.show();
            } catch (error) {
              Alert.alert('Ad error', 'The ad could not be shown. Please try again.');
            }
          },
        },
      ]
    );
  };
  
  const addFeeling = () => setDraft((d) => (d ? d + ' 😊' : 'Feeling good 😊'));

  const reportPerson = (name) => {
  setProfileMenuFor(null);

  Alert.alert(
    `Report ${name}?`,
    'This account will be reported for review if you believe it has violated Ascend’s Terms and Conditions.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        onPress: async () => {
          if (!user?.uid) return;

          try {
            await addDoc(collection(db, 'reports'), {
              reportedName: name,
              reportedByUid: user.uid,
              reportedByName: user.name || 'User',
              status: 'pending',
              createdAt: serverTimestamp(),
            });

            Alert.alert(
              'Report submitted',
              `${name}'s account has been reported and will be reviewed.`
            );
          } catch (error) {
            Alert.alert(
              'Error',
              'Your report could not be submitted. Please try again.'
            );
          }
        },
      },
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

  const messagePerson = async (name) => {
  setProfileMenuFor(null);

  try {
    const userQuery = query(
      collection(db, 'users'),
      where('name', '==', name)
    );

    const userSnapshot = await getDocs(userQuery);

    if (!userSnapshot.empty) {
      const friend = {
        uid: userSnapshot.docs[0].id,
        ...userSnapshot.docs[0].data(),
      };

      openPrivateChat(friend);
    } else {
      Alert.alert('Not found', 'This user could not be found.');
    }
  } catch (error) {
    Alert.alert('Message failed', error.message);
  }
};

  const openProfile = async (name, uid) => {
  setProfileMenuFor(null);
  setViewProfileFor(name);
  setViewProfileData(null);

  try {
    if (uid) {
      const byUid = await getDoc(doc(db, 'users', uid));
      if (byUid.exists()) {
        setViewProfileData(byUid.data());
        return;
      }
    }

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
          (u.name || '').toLowerCase().includes(term)
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
          notExpired(p) &&
          typeof p.name === 'string' &&
          (p.name || '').toLowerCase().includes(term)
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
          (g.name || '').toLowerCase().includes(term)
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
      fromUid: user.uid,
      text: `${user.name} sent you a friend request.`,
      type: 'friend_request',
      read: false,
      createdAt: serverTimestamp(),
    });
    sendPushTo(targetUser.uid, 'New friend request', `${user.name} sent you a friend request.`, { type: 'friend_request' });

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
      await setDoc(
        doc(db, 'privateChats', chatId),
        {
          members: [user.uid, req.fromUid],
          memberNames: { [user.uid]: user.name, [req.fromUid]: req.fromName },
          isFriend: true,
          status: 'active',
        },
        { merge: true }
      );

      await addDoc(collection(db, 'notifications'), {
  recipientUid: req.fromUid,
  from: user.name,
  fromUid: user.uid,
  text: `${user.name} accepted your friend request.`,
  type: 'friend_request_accepted',
  read: false,
  createdAt: serverTimestamp(),
});
      sendPushTo(req.fromUid, 'Friend request accepted', `${user.name} accepted your friend request.`, { type: 'friend_accepted' });
      
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
      if (activePrivateFriend.pendingCreate) {
        // First message to someone who is not a friend: it becomes a message request
        await setDoc(
          doc(db, 'privateChats', chatId),
          {
            members: [user.uid, activePrivateFriend.uid],
            memberNames: { [user.uid]: user.name, [activePrivateFriend.uid]: activePrivateFriend.name },
            isFriend: false,
            status: 'request',
            requesterUid: user.uid,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
        setActivePrivateFriend((prev) => (prev ? { ...prev, pendingCreate: false } : prev));
      }
            await addDoc(collection(db, 'privateChats', chatId, 'messages'), {
        text: privateDraft,
        senderUid: user.uid,
        senderName: user.name,
        timestamp: serverTimestamp(),
      });

      try {
        await updateDoc(doc(db, 'privateChats', chatId), {
          lastMessage: privateDraft.slice(0, 80),
          lastMessageAt: serverTimestamp(),
          lastSenderUid: user.uid,
        });
      } catch (chatError) {
        console.log('Could not save last message:', chatError);
      }
      const isMyRequest = activePrivateFriend.status === 'request' && activePrivateFriend.requesterUid === user.uid;
      if (isMyRequest && !activePrivateFriend.requestNotified && !requestNotifiedRef.current[chatId]) {
        requestNotifiedRef.current[chatId] = true;
        try {
          await addDoc(collection(db, 'notifications'), {
            recipientUid: activePrivateFriend.uid,
            from: user.name,
            fromUid: user.uid,
            text: `${user.name} sent you a message request.`,
            type: 'message_request',
            chatId,
            read: false,
            createdAt: serverTimestamp(),
          });
          await updateDoc(doc(db, 'privateChats', chatId), { requestNotified: true });
        } catch (requestError) {
          console.log('Could not notify about the request:', requestError);
        }
        sendPushTo(activePrivateFriend.uid, 'New message request', `${user.name}: ${privateDraft.slice(0, 80)}`, { type: 'message_request' });
      } else if (!isMyRequest) {
        sendPushTo(activePrivateFriend.uid, user.name, privateDraft.slice(0, 100), { type: 'message' });
      }

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

  const savePhone = async () => {
    const cleaned = editPhone.replace(/[\s()-]/g, '');

    if (cleaned && !/^\+?\d{7,15}$/.test(cleaned)) {
      Alert.alert(
        'Invalid phone number',
        'Enter 7 to 15 digits. You can start with +, for example +2348012345678.'
      );
      return;
    }

    if (!user?.uid) {
      Alert.alert('Error', 'Please log in again and try.');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', user.uid), { phone: cleaned });
      setUser((prev) => ({ ...prev, phone: cleaned }));
      setEditPhoneVisible(false);
      Alert.alert('Saved', cleaned ? 'Your phone number has been saved.' : 'Your phone number has been removed.');
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const deleteMyAccount = async () => {
    const current = auth.currentUser;

    if (!current || !current.email) {
      Alert.alert('Error', 'Please log in again and try.');
      return;
    }

    if (!deletePassword) {
      Alert.alert('Password needed', 'Enter your password to confirm.');
      return;
    }

    setDeleting(true);

    try {
      // Confirm it is really you
      await reauthenticateWithCredential(
        current,
        EmailAuthProvider.credential(current.email, deletePassword)
      );

      // Remove your posts (best effort), then your profile, then your login
      try {
        const mine = await getDocs(query(collection(db, 'posts'), where('authorUid', '==', current.uid)));
        await Promise.all(mine.docs.map((d) => deleteDoc(d.ref)));
      } catch (postError) {
        console.log('Could not remove posts:', postError);
      }

      const deletedUid = current.uid;
      await deleteDoc(doc(db, 'users', deletedUid));
      await deleteUser(current);
      await deleteSavedPassword(deletedUid);
      const remaining = savedAccounts.filter((a) => a.uid !== deletedUid);
      setSavedAccounts(remaining);
      await storeSavedAccounts(remaining);
    } catch (error) {
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        Alert.alert('Wrong password', 'That password is not correct.');
      } else {
        Alert.alert('Could not delete account', error.message);
      }
    } finally {
      setDeleting(false);
    }
  };

  const pickStoryMedia = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setStoryMedia({ uri: asset.uri, type: asset.type === 'video' ? 'video' : 'image' });
      }
    } catch (error) {
      Alert.alert('Could not open photos', error.message);
    }
  };

  const shareStory = async () => {
    if (storyPosting) return;
    if (!storyMedia && !storyText.trim()) {
      Alert.alert('Empty story', 'Write something or add a photo or video.');
      return;
    }
    setStoryPosting(true);
    try {
      let mediaUrl = '';
      if (storyMedia) {
        mediaUrl = await uploadToCloudinary(storyMedia.uri, storyMedia.type === 'video' ? 'video' : 'image', 'stories');
      }
      await addDoc(collection(db, 'stories'), {
        authorUid: user.uid,
        authorName: user.name,
        authorPhoto: user.photo || '',
        type: storyMedia ? storyMedia.type : 'text',
        text: storyText.trim(),
        bgIndex: storyBgIndex,
        mediaUrl,
        music: storyMusic.trim(),
        createdAt: serverTimestamp(),
        expiresAtMs: Date.now() + 24 * 60 * 60 * 1000,
      });
      setStoryText('');
      setStoryMedia(null);
      setStoryMusic('');
      setStoryComposerOpen(false);
    } catch (error) {
      Alert.alert('Story failed', error.message);
    } finally {
      setStoryPosting(false);
    }
  };

  const doLogout = async () => {
    lastPasswordRef.current = '';
    goTab('feed');
    try {
      await signOut(auth);
    } catch (error) {
      Alert.alert('Log out failed', error.message);
    }
  };

  const saveCurrentAccount = async (password) => {
    const current = auth.currentUser;
    if (!current || !current.email) throw new Error('Please log in again and try.');
    await setSavedPassword(current.uid, password);
    const entry = {
      uid: current.uid,
      email: current.email,
      name: (user && user.name) || current.email,
      photo: (user && user.photo) || '',
    };
    const next = [entry, ...savedAccounts.filter((a) => a.uid !== current.uid)].slice(0, 5);
    setSavedAccounts(next);
    await storeSavedAccounts(next);
  };

  const confirmLogout = () => {
    const current = auth.currentUser;
    const alreadySaved = !!current && savedAccounts.some((a) => a.uid === current.uid);

    if (Platform.OS === 'web' || alreadySaved) {
      doLogout();
      return;
    }

    Alert.alert(
      'Save login info?',
      'Save this account on this phone so you can switch accounts next time without typing your email and password?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Not now', onPress: doLogout },
        {
          text: 'Save',
          onPress: async () => {
            const known = lastPasswordRef.current;
            if (known) {
              try {
                await saveCurrentAccount(known);
              } catch (error) {
                Alert.alert('Could not save', error.message);
              }
              await doLogout();
            } else {
              setSaveThenLogout(true);
              setSavePasswordInput('');
              setSaveAccountOpen(true);
            }
          },
        },
      ]
    );
  };

  const confirmSaveAccount = async () => {
    const current = auth.currentUser;
    if (!current || !current.email) return;
    if (!savePasswordInput) {
      Alert.alert('Password needed', 'Enter your password to save this account.');
      return;
    }
    setSavingAccount(true);
    try {
      await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, savePasswordInput));
      await saveCurrentAccount(savePasswordInput);
      const shouldLogout = saveThenLogout;
      setSavePasswordInput('');
      setSaveAccountOpen(false);
      setSaveThenLogout(false);
      if (shouldLogout) {
        await doLogout();
      } else {
        Alert.alert('Saved', 'This account is saved on this phone.');
      }
    } catch (error) {
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        Alert.alert('Wrong password', 'That password is not correct.');
      } else {
        Alert.alert('Could not save account', error.message);
      }
    } finally {
      setSavingAccount(false);
    }
  };

  const removeSavedAccount = (acct) => {
    Alert.alert('Remove account', `Remove ${acct.name} from this phone?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteSavedPassword(acct.uid);
          const next = savedAccounts.filter((a) => a.uid !== acct.uid);
          setSavedAccounts(next);
          await storeSavedAccounts(next);
        },
      },
    ]);
  };

  const loginSavedAccount = async (acct) => {
    if (switchingUid) return;
    if (auth.currentUser && auth.currentUser.uid === acct.uid) {
      setSwitchAccountOpen(false);
      return;
    }
    setSwitchingUid(acct.uid);
    try {
      const password = await getSavedPassword(acct.uid);
      if (!password) {
        Alert.alert('Password needed', 'Log in with your email and password once to save this account again.');
        return;
      }
      if (auth.currentUser) await signOut(auth);
      await signInWithEmailAndPassword(auth, acct.email, password);
      lastPasswordRef.current = password;
      setSwitchAccountOpen(false);
    } catch (error) {
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        Alert.alert('Password changed', 'The saved password is no longer correct. Log in with your email and password to update it.');
      } else {
        Alert.alert('Could not log in', error.message);
      }
    } finally {
      setSwitchingUid('');
    }
  };

  const changeEmail = async () => {
    const newEmail = editEmail.trim();

    if (!/^\S+@\S+\.\S+$/.test(newEmail)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    if (!auth.currentUser) {
      Alert.alert('Error', 'Please log in again and try.');
      return;
    }

    try {
      await verifyBeforeUpdateEmail(auth.currentUser, newEmail);
      setEditEmailVisible(false);
      setEditEmail('');
      Alert.alert(
        'Check your new email',
        'We sent a link to the new address. Open it to finish changing your email. Your email stays the same until you do.'
      );
    } catch (error) {
      if (error.code === 'auth/requires-recent-login') {
        Alert.alert('Please log in again', 'For your safety, log out, log in again, then change your email.');
      } else {
        Alert.alert('Could not change email', error.message);
      }
    }
  };

  const saveProfile = async () => {
  if (!user?.uid) {
    Alert.alert('Error', 'Please log in again and try.');
    return;
  }

  const newAge = editAge.trim();

  if (newAge && !/^\d+$/.test(newAge)) {
    Alert.alert('Invalid age', 'Please enter a valid age.');
    return;
  }

  try {
    const updatedProfile = {
      bio: editBio.trim(),
      age: newAge ? Number(newAge) : null,
      gender: editGender.trim(),
      location: editLocation.trim(),
    };

    await updateDoc(doc(db, 'users', user.uid), updatedProfile);

    setUser((prev) => ({
      ...prev,
      ...updatedProfile,
    }));

    setEditProfileVisible(false);

    Alert.alert('Success', 'Your profile has been updated.');
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

  if (connection === 'offline') {
    return (
      <View style={[styles.app, { backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={[styles.title, { color: accent, fontSize: 30 }]}>Ascend</Text>
        <Text style={{ color: text, marginTop: 24, fontSize: 18, fontWeight: '700' }}>No internet connection</Text>
        <Text style={{ color: subtext, marginTop: 8, fontSize: 14, textAlign: 'center', paddingHorizontal: 24 }}>
          Check your Wi-Fi or mobile data. Ascend will reconnect automatically when you are back online.
        </Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: accent, marginTop: 24, paddingHorizontal: 32 }]}
          onPress={retryConnection}
          disabled={retrying}
        >
          <Text style={styles.buttonText}>{retrying ? 'Checking...' : 'Try again'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

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

    let notificationToken = null;

try {
  const tokenResponse =
    await Notifications.getExpoPushTokenAsync();

  notificationToken = tokenResponse.data;
} catch (error) {
  console.log('Could not get notification token:', error);
}

    let photoUrl = null;

    if (signupPhoto) {
      try {
        photoUrl = await uploadToCloudinary(signupPhoto, 'image', 'profilePictures');
      } catch (uploadError) {
        // The account is already created, so keep going without a picture.
        console.log('Signup photo upload failed:', uploadError);
      }
    }

    await setDoc(doc(db, 'users', result.user.uid), {
      uid: result.user.uid,
      name: nameInput.trim(),
      gender: genderInput,
      age: Number(ageInput),
      email: emailInput.trim().toLowerCase(),
      notificationToken: notificationToken,
      location: '',
      photo: photoUrl,
      profileComplete: false,
      points: 40,
      lastLoginDate: todayKey(),
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
    pagePhotoUrl = await uploadToCloudinary(pagePhoto, 'image', 'pagePictures');
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
    expiresAtMs: PAGE_LIFETIME_HOURS ? Date.now() + PAGE_LIFETIME_HOURS * 3600 * 1000 : null,
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

const isFollowingAuthor = (authorUid) =>
  !!authorUid && (followedPages.includes(authorUid) || followedPages.includes(`user_${authorUid}`));

const followAuthor = async (authorUid, authorName) => {
  if (!user?.uid || !authorUid) return;
  const isPage = pages.some((pg) => pg.id === authorUid);
  if (isPage) {
    await handleFollowPage(authorUid);
    return;
  }
  try {
    await addDoc(collection(db, 'follows'), {
      userUid: user.uid,
      userName: user.name || '',
      targetUid: authorUid,
      targetName: authorName || '',
      pageId: `user_${authorUid}`,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    Alert.alert('Follow failed', error.message);
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
  if (authLoading) return;
  setAuthLoading(true);

  try {
    await signInWithEmailAndPassword(
      auth,
      emailInput.trim(),
      passInput
    );
    lastPasswordRef.current = passInput;
    // The spinner stays on until your account has finished loading.
  } catch (error) {
    setAuthLoading(false);
    Alert.alert('Log in failed', error.message);
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

        {authMode === 'login' && savedAccounts.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: text, fontSize: 18, fontWeight: '800', marginBottom: 8 }}>Saved accounts</Text>
            {savedAccounts.map((acct) => (
              <TouchableOpacity
                key={acct.uid}
                onPress={() => loginSavedAccount(acct)}
                disabled={!!switchingUid}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: cardBg, borderWidth: 1, borderColor: border, borderRadius: 14, padding: 12, marginBottom: 8, opacity: switchingUid && switchingUid !== acct.uid ? 0.5 : 1 }}
              >
                <Avatar uid={acct.uid} photo={acct.photo} name={acct.name} size={52} bg={pillBg} color={accent} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: text, fontSize: 17, fontWeight: '700' }}>{acct.name}</Text>
                  <Text numberOfLines={1} style={{ color: subtext, fontSize: 13 }}>{switchingUid === acct.uid ? 'Logging in...' : acct.email}</Text>
                </View>
                <TouchableOpacity onPress={() => removeSavedAccount(acct)} style={{ padding: 8 }}>
                  <Ionicons name="close" size={22} color={subtext} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            <Text style={{ color: subtext, textAlign: 'center', marginVertical: 6 }}>or log in with another account</Text>
          </View>
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
      {['feed', 'videos'].includes(screen) && (
      <View style={styles.header}>
        <Text style={{ color: accent, fontSize: 32, fontWeight: '800', letterSpacing: -1 }}>Ascend</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => {
              goTab('feed');
              setComposerOpen(true);
            }}
            style={circleStyle}
            accessibilityLabel="Create post"
          >
            <Ionicons name="add" size={26} color={text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setScreen('search')} style={circleStyle} accessibilityLabel="Search">
            <Ionicons name="search" size={22} color={text} />
          </TouchableOpacity>
        </View>
      </View>
      )}

      {screen === 'feed' && (
        <ScrollView
          style={{ flex: 1, marginHorizontal: -16 }}
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          <View style={{ backgroundColor: cardBg, paddingHorizontal: 12, paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setScreen('profile')}>
                <Avatar uid={user.uid} photo={user.photo} name={user.name} size={46} bg={bg} color={accent} />
              </TouchableOpacity>
              <TextInput
                style={{ flex: 1, marginHorizontal: 10, backgroundColor: pillBg, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, color: text, fontSize: 16, maxHeight: 120 }}
                placeholder="What's on your mind?"
                placeholderTextColor={subtext}
                value={draft}
                onChangeText={setDraft}
                onFocus={() => setComposerOpen(true)}
                multiline
              />
              <TouchableOpacity
                onPress={() => {
                  setComposerOpen(true);
                  pickMedia('photo');
                }}
                style={{ alignItems: 'center' }}
              >
                <Text style={{ fontSize: 26 }}>🖼️</Text>
                <Text style={{ color: text, fontSize: 12 }}>Photo</Text>
              </TouchableOpacity>
            </View>

            {(composerOpen || !!draft || !!draftMedia) && (
              <View style={{ marginTop: 10 }}>
                {draftMedia && (
                  draftMedia.type === 'video'
                    ? <Text style={{ color: subtext, marginBottom: 8 }}>🎥 Video attached</Text>
                    : <Image source={{ uri: draftMedia.uri }} style={{ width: '100%', height: 180, borderRadius: 10, marginBottom: 8 }} />
                )}
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={[styles.smallButton, { backgroundColor: pillBg, flex: 1 }]} onPress={() => pickMedia('reel')}>
                    <Text style={{ color: text, fontWeight: 'bold', fontSize: 12.5 }}>🎬 Reel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.smallButton, { backgroundColor: pillBg, flex: 1 }]} onPress={() => pickMedia('video')}>
                    <Text style={{ color: text, fontWeight: 'bold', fontSize: 12.5 }}>🎥 Video</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.smallButton, { backgroundColor: pillBg, flex: 1 }]} onPress={addFeeling}>
                    <Text style={{ color: text, fontWeight: 'bold', fontSize: 12.5 }}>😊 Feeling</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.smallButton, { backgroundColor: pillBg, flex: 1 }]} onPress={() => setScreen('ranks')}>
                    <Text style={{ color: text, fontWeight: 'bold', fontSize: 12.5 }}>🏆 Point</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: accent, marginTop: 10, marginBottom: 0 }]}
                  onPress={async () => {
                    await addPost();
                    setComposerOpen(false);
                  }}
                  disabled={posting}
                >
                  <Text style={styles.buttonText}>{posting ? (draftMedia ? 'Uploading... please wait' : 'Posting...') : 'Post (+2)'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setComposerOpen(false)} style={{ alignItems: 'center', paddingTop: 10 }}>
                  <Text style={{ color: subtext, fontWeight: '700' }}>Close</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={{ backgroundColor: cardBg, paddingVertical: 10, marginTop: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }} style={{ flexGrow: 0 }}>
              <TouchableOpacity
                onPress={() => setStoryComposerOpen(true)}
                style={{ width: 104, height: 176, borderRadius: 14, overflow: 'hidden', marginRight: 8, borderWidth: 1, borderColor: border, backgroundColor: cardBg }}
              >
                {user.photo ? (
                  <Image source={{ uri: user.photo }} style={{ width: '100%', height: 124 }} />
                ) : (
                  <View style={{ height: 124, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800' }}>{((user.name || '?').trim().charAt(0) || '?').toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ position: 'absolute', top: 106, left: 0, right: 0, alignItems: 'center' }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: accent, borderWidth: 3, borderColor: cardBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', marginTop: -2 }}>+</Text>
                  </View>
                </View>
                <Text style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', color: text, fontWeight: '700', fontSize: 13 }}>Create story</Text>
              </TouchableOpacity>

              {storyGroups.map((g, i) => {
                const last = g.items[g.items.length - 1];
                const mine = g.uid === user.uid;
                return (
                  <TouchableOpacity
                    key={g.uid}
                    onPress={() => setStoryViewer({ uid: g.uid, index: 0 })}
                    style={{ width: 104, height: 176, borderRadius: 14, overflow: 'hidden', marginRight: 8, backgroundColor: STORY_BGS[(last.bgIndex || i) % STORY_BGS.length], justifyContent: 'space-between', padding: 8 }}
                  >
                    {last.type === 'image' && !!last.mediaUrl && (
                      <Image source={{ uri: last.mediaUrl }} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
                    )}
                    {last.type === 'video' && (
                      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' }}>
                        <Ionicons name="play-circle" size={44} color="rgba(255,255,255,0.8)" />
                      </View>
                    )}
                    {last.type === 'text' && (
                      <Text numberOfLines={5} style={{ position: 'absolute', top: 60, left: 8, right: 8, color: '#fff', fontWeight: '700', fontSize: 13, textAlign: 'center' }}>{last.text}</Text>
                    )}
                    <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: accent, overflow: 'hidden', backgroundColor: cardBg }}>
                      <Avatar uid={g.uid} name={g.name} size={38} bg={pillBg} color={accent} />
                    </View>
                    <Text numberOfLines={2} style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{mine ? 'Your story' : g.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View>
            {feedPosts.length === 0 && (
              <Text style={{ color: subtext, textAlign: 'center', marginTop: 24, marginBottom: 24 }}>
                No posts yet. Share something to get started.
              </Text>
            )}
            {feedItems.map((p) => {
              if (p.isAd) return <AdBanner key={p.id} />;

              if (p.isReels) {
                return (
                  <View key={p.id} style={{ backgroundColor: cardBg, marginTop: 8, paddingVertical: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 10 }}>
                      <Text style={{ fontSize: 22, marginRight: 8 }}>🎞️</Text>
                      <Text style={{ color: text, fontSize: 19, fontWeight: '800', flex: 1 }}>Reels</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
                      {reelPosts.slice(0, 6).map((r) => (
                        <View key={r.id} style={{ width: 240, marginRight: 10 }}>
                          {r.media?.uri ? (
                            <AscendVideoPlayer uri={r.media.uri} height={360} radius={14} />
                          ) : (
                            <View style={{ height: 360, borderRadius: 14, backgroundColor: pillBg, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: subtext }}>Video unavailable</Text>
                            </View>
                          )}
                          <Text numberOfLines={1} style={{ color: text, fontWeight: '700', marginTop: 6 }}>{r.author}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                );
              }

              const likeCount = (p.likes || []).length;
              const liked = (p.likes || []).includes(user.uid);
              const isMine = p.authorUid ? p.authorUid === user.uid : p.author === user.name;

              return (
                <View key={p.id} style={{ backgroundColor: cardBg, marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12 }}>
                    <TouchableOpacity
                      onPress={() => (isMine ? setScreen('profile') : openProfile(p.author, p.authorUid))}
                      style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                    >
                      <Avatar uid={p.authorUid} photo={p.authorUid && p.authorUid === user.uid ? user.photo : undefined} name={p.author} size={44} bg={bg} color={accent} style={{ marginRight: 10 }} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text numberOfLines={1} style={{ color: text, fontWeight: '800', fontSize: 16, flexShrink: 1 }}>{p.author}</Text>
                          {p.verified === true && (
                            <VerifiedBadge />
                          )}
                          {!isMine && !!p.authorUid && pages.some((pg) => pg.id === p.authorUid) && !isFollowingAuthor(p.authorUid) && (
                            <Text onPress={() => followAuthor(p.authorUid, p.author)} style={{ color: accent, fontWeight: '800', fontSize: 15 }}>{'  •  Follow'}</Text>
                          )}
                        </View>
                        <Text style={{ color: subtext, fontSize: 13 }}>{timeAgo(p.timestamp)} · 🌍</Text>
                      </View>
                    </TouchableOpacity>
                    {!isMine && (
                      <TouchableOpacity onPress={() => setProfileMenuFor(p.author)} style={{ padding: 6 }}>
                        <Text style={{ color: subtext, fontWeight: '900', fontSize: 18 }}>•••</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => setHiddenPostIds((prev) => [...prev, p.id])} style={{ padding: 6 }}>
                      <Text style={{ color: subtext, fontSize: 20 }}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {!!p.text && (
                    <Text style={{ color: text, fontSize: 17, lineHeight: 23, paddingHorizontal: 12, paddingTop: 10, paddingBottom: p.media ? 10 : 6 }}>{p.text}</Text>
                  )}

                  {p.media && (
                    p.media.type === 'video'
                      ? p.media.uri
                        ? <AscendVideoPlayer uri={p.media.uri} height={300} radius={0} />
                        : (
                          <View style={{ height: 220, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: subtext }}>Video unavailable</Text>
                          </View>
                        )
                      : <Image source={{ uri: p.media.uri }} style={{ width: '100%', height: 320 }} resizeMode="cover" />
                  )}

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 10 }}>
                    <Text style={{ color: subtext }}>{likeCount > 0 ? `👍 ${likeCount}` : ''}</Text>
                    <Text style={{ color: subtext }}>{(p.commentCount || 0) > 0 ? `${p.commentCount} comments` : ''}</Text>
                  </View>

                  <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 8, gap: 8 }}>
                    <TouchableOpacity onPress={() => toggleLike(p)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: pillBg, borderRadius: 22, paddingVertical: 10 }}>
                      <Text style={{ fontSize: 17, opacity: liked ? 1 : 0.6 }}>👍</Text>
                      <Text style={{ color: liked ? accent : text, fontWeight: '700' }}>{likeCount}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setCommentingPostId(commentingPostId === p.id ? null : p.id)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: pillBg, borderRadius: 22, paddingVertical: 10 }}>
                      <Text style={{ fontSize: 17 }}>💬</Text>
                      <Text style={{ color: text, fontWeight: '700' }}>{p.commentCount || 0}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => sharePost(p)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: pillBg, borderRadius: 22, paddingVertical: 10 }}>
                      <Text style={{ fontSize: 17 }}>↗️</Text>
                      <Text style={{ color: text, fontWeight: '700' }}>{p.shareCount || 0}</Text>
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
              );
            })}
          </View>
        </ScrollView>
      )}

      {screen === 'reels' && (
        <ScrollView style={{ flex: 1 }}>
          <Text style={{ color: text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>🎬 Reels</Text>
          {reelPosts.length === 0 && (
  <Text style={{ color: subtext }}>
    No Reels posted yet. Post a Reel from the Feed to see it here.
  </Text>
)}
          {reelPosts.map((p) => (
            <View key={p.id} style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Avatar uid={p.authorUid} photo={p.authorUid && p.authorUid === user.uid ? user.photo : undefined} name={p.author} size={30} bg={bg} color={accent} style={{ marginRight: 8 }} />
                <Text style={{ color: text, fontWeight: '700' }}>{p.author}</Text>
              </View>
              <>
  {p.media?.uri ? (
    <AscendVideoPlayer uri={p.media.uri} />
  ) : (
    <View
      style={{
        height: 220,
        borderRadius: 12,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: subtext }}>
        Video unavailable
      </Text>
    </View>
  )}

  {!!p.text && (
  <Text style={{ color: subtext, marginTop: 6 }}>
    {p.text}
  </Text>
)}

<View
  style={{
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  }}
>
  <TouchableOpacity
    onPress={() => toggleLike(p)}
    style={[styles.smallButton, { backgroundColor: bg }]}
  >
    <Text style={{ color: text, fontWeight: '700' }}>
      {(p.likes || []).includes(user.uid) ? '❤️' : '🤍'} Like {p.likes?.length || 0}
    </Text>
  </TouchableOpacity>

  <TouchableOpacity
    onPress={() => setCommentingPostId(p.id)}
    style={[styles.smallButton, { backgroundColor: bg }]}
  >
    <Text style={{ color: text, fontWeight: '700' }}>
      💬 Comment {p.commentCount || 0}
    </Text>
  </TouchableOpacity>
</View>

</>

      {commentingPostId === p.id && (
  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
    <TextInput
      style={[
        styles.input,
        {
          borderColor: border,
          color: text,
          backgroundColor: bg,
          flex: 1,
          marginBottom: 0,
        },
      ]}
      placeholder="Write a comment..."
      placeholderTextColor={subtext}
      value={commentDraft}
      onChangeText={setCommentDraft}
    />

    <TouchableOpacity
      style={{
        backgroundColor: accent,
        borderRadius: 10,
        paddingHorizontal: 14,
        justifyContent: 'center',
      }}
      onPress={() => submitComment(p)}
    >
      <Text style={{ color: '#fff', fontWeight: 'bold' }}>
        Post
      </Text>
        </TouchableOpacity>
  </View>
)}

</View>
))}

</ScrollView>
)}

{screen === 'videos' && (
  <ScrollView style={{ flex: 1 }}>
    <Text
      style={{
        color: text,
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 12,
      }}
    >
      🎥 Videos
    </Text>

    {videoPosts.length === 0 && (
      <Text style={{ color: subtext }}>
        No videos posted yet. Post a Video from the Feed to see it here.
      </Text>
    )}

    {withAds(videoPosts, 3).map((p) => p.isAd ? <AdBanner key={p.id} /> : (
      <View
        key={p.id}
        style={[
          styles.card,
          { backgroundColor: cardBg, borderColor: border },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Avatar uid={p.authorUid} photo={p.authorUid && p.authorUid === user.uid ? user.photo : undefined} name={p.author} size={30} bg={bg} color={accent} style={{ marginRight: 8 }} />
          <Text style={{ color: text, fontWeight: '700' }}>{p.author}</Text>
        </View>

        <>
  {p.media?.uri ? (
    <AscendVideoPlayer uri={p.media.uri} />
  ) : (
    <View
      style={{
        height: 220,
        borderRadius: 12,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: subtext }}>
        Video unavailable
      </Text>
    </View>
  )}

  {!!p.text && (
    <Text style={{ color: subtext, marginTop: 6 }}>
      {p.text}
    </Text>
  )}
</>

  <View
  style={{
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  }}
>
  <TouchableOpacity
    onPress={() => toggleLike(p)}
    style={[styles.smallButton, { backgroundColor: bg }]}
  >
    <Text style={{ color: text, fontWeight: '700' }}>
      {(p.likes || []).includes(user.uid) ? '❤️' : '🤍'} Like {p.likes?.length || 0}
    </Text>
  </TouchableOpacity>

  <TouchableOpacity
    onPress={() =>
      setCommentingPostId(
        commentingPostId === p.id ? null : p.id
      )
    }
    style={[styles.smallButton, { backgroundColor: bg }]}
  >
    <Text style={{ color: text, fontWeight: '700' }}>
      💬 Comment {p.commentCount || 0}
    </Text>
  </TouchableOpacity>
</View>

      {commentingPostId === p.id && (
  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
    <TextInput
      style={[
        styles.input,
        {
          borderColor: border,
          color: text,
          backgroundColor: bg,
          flex: 1,
          marginBottom: 0,
        },
      ]}
      placeholder="Write a comment..."
      placeholderTextColor={subtext}
      value={commentDraft}
      onChangeText={setCommentDraft}
    />

    <TouchableOpacity
      style={{
        backgroundColor: accent,
        borderRadius: 10,
        paddingHorizontal: 14,
        justifyContent: 'center',
      }}
      onPress={() => submitComment(p)}
    >
      <Text style={{ color: '#fff', fontWeight: 'bold' }}>
        Post
      </Text>
    </TouchableOpacity>
  </View>
)}
  
      </View>
    ))}
  </ScrollView>
)}

{screen === 'search' && (
        <ScrollView style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => setScreen('chat')}>
            <Text style={{ color: accent, fontWeight: '700', marginBottom: 12 }}>← Back to Messages</Text>
          </TouchableOpacity>
          <Text style={{ color: text, fontSize: 24, fontWeight: '800', marginBottom: 10 }}>Search and groups</Text>

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
    <TouchableOpacity
      disabled={searchCategory !== 'people'}
      onPress={() => openProfile(r.name, r.uid)}
    >
      <Avatar uid={r.uid} photo={r.photo} name={r.name} size={38} bg={bg} color={accent} style={{ marginRight: 10 }} />
    </TouchableOpacity>
    <View style={{ flex: 1 }}>
  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    <Text
      style={{ color: text, fontWeight: '700' }}
      onPress={searchCategory === 'people' ? () => openProfile(r.name, r.uid) : undefined}
    >
      {r.name}
    </Text>

    {searchCategory === 'pages' && r.Verified === true && (
      <VerifiedBadge />
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
)))}


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
    <Avatar uid={req.fromUid} name={req.fromName} size={36} bg={bg} color={accent} style={{ marginRight: 10 }} />
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
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={() => openProfile(f.name, f.uid)}>
                  <Avatar uid={f.uid} name={f.name} size={40} bg={bg} color={accent} style={{ marginRight: 10 }} />
                </TouchableOpacity>
                <Text style={{ color: text, fontWeight: '700' }}>{f.name}</Text>
              </View>
            </TouchableOpacity>
          ))}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 6 }}>
            <Text style={{ color: text, fontWeight: '700' }}>Groups</Text>
            <TouchableOpacity onPress={() => setCreatingGroup(true)}>
              <Text style={{ color: accent, fontWeight: '700' }}>+ New Group</Text>
            </TouchableOpacity>
          </View>
          {groups.map((g) => (
            <TouchableOpacity key={g.id} style={[styles.card, { backgroundColor: cardBg, borderColor: border }]} onPress={() => {
  setActiveGroup(g);
  setScreen('chat');
}}>
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

          <TouchableOpacity style={[styles.card, { backgroundColor: cardBg, borderColor: accent, borderWidth: 1.5, marginTop: 10 }]} onPress={() => {
  setGroupChatOpen(true);
  setScreen('chat');
}}>
            <Text style={{ color: text, fontWeight: '700' }}>🌐 Family & Friends (real chat)</Text>
            <Text style={{ color: subtext, fontSize: 12 }}>Everyone with the app can message here for real</Text>
          </TouchableOpacity>
        
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
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: m.senderUid === user.uid ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
                {m.senderUid !== user.uid && <Avatar uid={m.senderUid} name={m.senderName} size={26} bg={cardBg} color={accent} style={{ marginRight: 6 }} />}
                <View style={{ maxWidth: '75%', alignItems: m.senderUid === user.uid ? 'flex-end' : 'flex-start' }}>
                  {m.senderUid !== user.uid && <Text style={{ color: subtext, fontSize: 11, marginBottom: 2 }}>{m.senderName}</Text>}
                  <View style={{ backgroundColor: m.senderUid === user.uid ? accent : cardBg, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 }}>
                    <Text style={{ color: m.senderUid === user.uid ? '#fff' : text }}>{m.text}</Text>
                  </View>
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
          <TouchableOpacity
            onPress={() => openProfile(activePrivateFriend.name, activePrivateFriend.uid)}
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}
          >
            <Avatar uid={activePrivateFriend.uid} name={activePrivateFriend.name} size={36} bg={cardBg} color={accent} style={{ marginRight: 10 }} />
            <Text style={{ color: text, fontWeight: '700', fontSize: 16 }}>{activePrivateFriend.name}</Text>
          </TouchableOpacity>
          <ScrollView style={{ flex: 1, marginBottom: 8 }}>
            {privateMessages.map((m) => (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: m.senderUid === user.uid ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
                {m.senderUid !== user.uid && <Avatar uid={m.senderUid} name={activePrivateFriend.name} size={26} bg={cardBg} color={accent} style={{ marginRight: 6 }} />}
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

      {screen === 'chat' && !groupChatOpen && !activePrivateFriend && !activeGroup && (
        <View style={{ flex: 1, marginHorizontal: -16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 }}>
            <TouchableOpacity onPress={() => setScreen('feed')} style={{ paddingRight: 10 }}>
              <Ionicons name="chevron-back" size={28} color={text} />
            </TouchableOpacity>
            <Text style={{ flex: 1, color: text, fontSize: 28, fontWeight: '800' }}>Messages</Text>
            <TouchableOpacity onPress={() => setScreen('search')} style={{ padding: 6 }}>
              <Ionicons name="search" size={26} color={text} />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', paddingHorizontal: 14, marginBottom: 8 }}>
            {[{ key: 'chats', label: 'Chats' }, { key: 'requests', label: 'Message Requests', badge: messageRequests.length }].map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setMessengerTab(t.key)}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: messengerTab === t.key ? accent : pillBg, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9, marginRight: 8 }}
              >
                <Text style={{ color: messengerTab === t.key ? '#fff' : text, fontWeight: '800', fontSize: 14 }}>{t.label}</Text>
                {!!t.badge && (
                  <View style={{ marginLeft: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#e11d48', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{t.badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {messengerTab === 'requests' && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }} refreshControl={refreshControl}>
              <View style={{ backgroundColor: darkMode ? '#143323' : '#e7f3ec', marginHorizontal: 14, borderRadius: 12, padding: 14, marginBottom: 6 }}>
                <Text style={{ color: text, fontSize: 15 }}>These messages are from people who aren't your friends.</Text>
              </View>
              {messageRequests.length === 0 && (
                <Text style={{ color: subtext, textAlign: 'center', marginTop: 24 }}>No message requests.</Text>
              )}
              {messageRequests.map((c) => (
                <View key={c.chatId} style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10 }}>
                  <TouchableOpacity onPress={() => openProfile(c.name, c.uid)}>
                    <Avatar uid={c.uid} name={c.name} size={56} bg={pillBg} color={accent} style={{ marginRight: 12 }} />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: text, fontSize: 17, fontWeight: '800' }}>{c.name}</Text>
                    <Text numberOfLines={2} style={{ color: subtext, fontSize: 15, marginTop: 2 }}>{c.lastMessage || 'Sent you a message.'}</Text>
                    <View style={{ flexDirection: 'row', marginTop: 8 }}>
                      <TouchableOpacity onPress={() => acceptMessageRequest(c)} style={{ flex: 1, backgroundColor: accent, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginRight: 8 }}>
                        <Text style={{ color: '#fff', fontWeight: '800' }}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => declineMessageRequest(c)} style={{ flex: 1, backgroundColor: pillBg, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                        <Text style={{ color: text, fontWeight: '800' }}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {messengerTab === 'chats' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }} refreshControl={refreshControl}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }} style={{ flexGrow: 0, marginBottom: 10 }}>
              <TouchableOpacity onPress={() => setScreen('friends')} style={{ alignItems: 'center', width: 76, marginRight: 4 }}>
                <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: pillBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="person-add" size={26} color={text} />
                </View>
                <Text numberOfLines={1} style={{ color: text, fontSize: 13, marginTop: 4 }}>Add friends</Text>
              </TouchableOpacity>
              {realFriends.map((f) => (
                <TouchableOpacity key={f.uid} onPress={() => openPrivateChat(f)} style={{ alignItems: 'center', width: 76, marginRight: 4 }}>
                  <Avatar uid={f.uid} name={f.name} size={62} bg={pillBg} color={accent} />
                  <Text numberOfLines={1} style={{ color: text, fontSize: 13, marginTop: 4 }}>{(f.name || '').split(' ')[0]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {inboxChats
              .slice()
              .sort((a, b) => ((b.lastMessageAt && b.lastMessageAt.toMillis ? b.lastMessageAt.toMillis() : 0) - (a.lastMessageAt && a.lastMessageAt.toMillis ? a.lastMessageAt.toMillis() : 0)))
              .map((f) => (
                <TouchableOpacity
                  key={f.chatId}
                  onPress={() => openPrivateChat(f)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 }}
                >
                  <Avatar uid={f.uid} name={f.name} size={56} bg={pillBg} color={accent} style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: text, fontSize: 17, fontWeight: f.lastMessage && f.lastSenderUid !== user.uid ? '800' : '500' }}>{f.name}</Text>
                    <Text numberOfLines={1} style={{ color: subtext, fontSize: 15, marginTop: 2 }}>
                      {f.lastMessage ? `${f.lastSenderUid === user.uid ? 'You: ' : ''}${f.lastMessage}` : 'Say hi 👋'}
                    </Text>
                  </View>
                  {!!f.lastMessageAt && <Text style={{ color: subtext, fontSize: 12 }}>{timeAgo(f.lastMessageAt)}</Text>}
                </TouchableOpacity>
              ))}

            <TouchableOpacity
              onPress={() => setGroupChatOpen(true)}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 }}
            >
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Ionicons name="people" size={26} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: text, fontSize: 17, fontWeight: '500' }}>Family chat</Text>
                <Text style={{ color: subtext, fontSize: 15, marginTop: 2 }}>Everyone on Ascend</Text>
              </View>
            </TouchableOpacity>

            {groups.map((g) => (
              <TouchableOpacity
                key={g.id}
                onPress={() => setActiveGroup(g)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 }}
              >
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: pillBg, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Text style={{ color: accent, fontWeight: '800', fontSize: 22 }}>{((g.name || '?').trim().charAt(0) || '?').toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: text, fontSize: 17, fontWeight: '500' }}>{g.name}</Text>
                  <Text style={{ color: subtext, fontSize: 15, marginTop: 2 }}>{(g.members || []).length} members</Text>
                </View>
              </TouchableOpacity>
            ))}

            {inboxChats.length === 0 && groups.length === 0 && (
              <Text style={{ color: subtext, textAlign: 'center', marginTop: 20, paddingHorizontal: 20 }}>
                No chats yet. Add friends to start chatting.
              </Text>
            )}
          </ScrollView>
          )}

          <TouchableOpacity
            onPress={() => {
              setScreen('search');
              setCreatingGroup(true);
            }}
            style={{ position: 'absolute', right: 18, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', elevation: 6 }}
          >
            <Ionicons name="add" size={32} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {screen === 'friends' && (
        <ScrollView style={{ flex: 1, marginHorizontal: -16 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 }}>
            <TouchableOpacity onPress={() => setScreen('feed')} style={{ paddingRight: 10 }}>
              <Ionicons name="chevron-back" size={28} color={text} />
            </TouchableOpacity>
            <Text style={{ flex: 1, color: text, fontSize: 28, fontWeight: '800' }}>Friends</Text>
            <TouchableOpacity onPress={() => setScreen('search')} style={{ padding: 6 }}>
              <Ionicons name="search" size={26} color={text} />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', paddingHorizontal: 14, marginBottom: 6 }}>
            {[{ key: 'suggestions', label: 'Suggestions' }, { key: 'mine', label: 'Your friends' }].map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setFriendsTab(t.key)}
                style={{ backgroundColor: friendsTab === t.key ? accent : pillBg, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginRight: 8 }}
              >
                <Text style={{ color: friendsTab === t.key ? '#fff' : text, fontWeight: '800', fontSize: 15 }}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {friendsTab === 'suggestions' ? (
            <View>
              <Text style={{ color: text, fontSize: 20, fontWeight: '800', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 }}>Friend requests{incomingRequests.length > 0 ? ` (${incomingRequests.length})` : ''}</Text>
              {incomingRequests.length === 0 && (
                <Text style={{ color: subtext, paddingHorizontal: 14, paddingBottom: 8 }}>No new friend requests.</Text>
              )}
              {incomingRequests.map((req) => (
                <View key={req.id} style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8 }}>
                  <TouchableOpacity onPress={() => openProfile(req.fromName, req.fromUid)}>
                    <Avatar uid={req.fromUid} name={req.fromName} size={76} bg={pillBg} color={accent} style={{ marginRight: 12 }} />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text numberOfLines={1} style={{ color: text, fontSize: 18, fontWeight: '700', flex: 1 }}>{req.fromName}</Text>
                      {!!req.createdAt && <Text style={{ color: subtext, fontSize: 13 }}>{timeAgo(req.createdAt)}</Text>}
                    </View>
                    <View style={{ flexDirection: 'row', marginTop: 8 }}>
                      <TouchableOpacity onPress={() => acceptFriendRequest(req)} style={{ flex: 1, backgroundColor: accent, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginRight: 8 }}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Confirm</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => rejectFriendRequest(req)} style={{ flex: 1, backgroundColor: pillBg, borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}>
                        <Text style={{ color: text, fontWeight: '800', fontSize: 15 }}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}

              <Text style={{ color: text, fontSize: 20, fontWeight: '800', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 }}>People you may know</Text>
              {suggestions
                .filter(
                  (u) =>
                    u.uid !== user.uid &&
                    !realFriends.some((f) => f.uid === u.uid) &&
                    !incomingRequests.some((r) => r.fromUid === u.uid) &&
                    !sentRequestIds.includes(u.uid) &&
                    !removedSuggestionIds.includes(u.uid)
                )
                .map((u) => (
                  <View key={u.uid} style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8 }}>
                    <TouchableOpacity onPress={() => openProfile(u.name, u.uid)}>
                      <Avatar uid={u.uid} photo={u.photo} name={u.name} size={76} bg={pillBg} color={accent} style={{ marginRight: 12 }} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: text, fontSize: 18, fontWeight: '700' }}>{u.name}</Text>
                      <View style={{ flexDirection: 'row', marginTop: 8 }}>
                        <TouchableOpacity
                          onPress={async () => {
                            await sendFriendRequest(u);
                            setSentRequestIds((prev) => [...prev, u.uid]);
                          }}
                          style={{ flex: 1, backgroundColor: accent, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginRight: 8 }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Add friend</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setRemovedSuggestionIds((prev) => [...prev, u.uid])}
                          style={{ flex: 1, backgroundColor: pillBg, borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}
                        >
                          <Text style={{ color: text, fontWeight: '800', fontSize: 15 }}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
            </View>
          ) : (
            <View>
              <Text style={{ color: text, fontSize: 20, fontWeight: '800', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 }}>{realFriends.length} friends</Text>
              {realFriends.length === 0 && (
                <Text style={{ color: subtext, paddingHorizontal: 14 }}>You have no friends yet. Add some from Suggestions.</Text>
              )}
              {realFriends.map((f) => (
                <View key={f.uid} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 }}>
                  <TouchableOpacity onPress={() => openProfile(f.name, f.uid)}>
                    <Avatar uid={f.uid} name={f.name} size={60} bg={pillBg} color={accent} style={{ marginRight: 12 }} />
                  </TouchableOpacity>
                  <Text numberOfLines={1} style={{ color: text, fontSize: 18, fontWeight: '700', flex: 1 }}>{f.name}</Text>
                  <TouchableOpacity onPress={() => openPrivateChat(f)} style={{ backgroundColor: pillBg, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
                    <Text style={{ color: text, fontWeight: '800' }}>Message</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {screen === 'notifications' && (
        <View style={{ flex: 1, marginHorizontal: -16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 }}>
            <TouchableOpacity onPress={() => setScreen('feed')} style={{ paddingRight: 10 }}>
              <Ionicons name="chevron-back" size={28} color={text} />
            </TouchableOpacity>
            <Text style={{ flex: 1, color: text, fontSize: 28, fontWeight: '800' }}>Notifications</Text>
            <TouchableOpacity
              onPress={() =>
                Promise.all(
                  notifications.filter((n) => n.id !== 1 && !n.read).map((n) => updateDoc(doc(db, 'notifications', n.id), { read: true }))
                ).catch((error) => console.log('Notification read error:', error))
              }
              style={[circleStyle, { marginRight: 8 }]}
              accessibilityLabel="Mark all as read"
            >
              <Ionicons name="checkmark" size={22} color={text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setScreen('search')} style={circleStyle}>
              <Ionicons name="search" size={22} color={text} />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', paddingHorizontal: 14, marginBottom: 6 }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'friends', label: 'Friend Requests', badge: incomingRequests.length },
              { key: 'requests', label: 'Message Requests', badge: messageRequests.length },
            ].map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setNotifTab(t.key)}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: notifTab === t.key ? accent : pillBg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, marginRight: 8 }}
              >
                <Text style={{ color: notifTab === t.key ? '#fff' : text, fontWeight: '800', fontSize: 13.5 }}>{t.label}</Text>
                {!!t.badge && (
                  <View style={{ marginLeft: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#e11d48', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{t.badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {notifTab !== 'all' && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} refreshControl={refreshControl}>
              {notifTab === 'friends' && incomingRequests.length === 0 && (
                <Text style={{ color: subtext, textAlign: 'center', marginTop: 24 }}>No friend requests.</Text>
              )}
              {notifTab === 'friends' &&
                incomingRequests.map((req) => (
                  <View key={req.id} style={{ flexDirection: 'row', padding: 12 }}>
                    <TouchableOpacity onPress={() => openProfile(req.fromName, req.fromUid)}>
                      <Avatar uid={req.fromUid} name={req.fromName} size={56} bg={pillBg} color={accent} style={{ marginRight: 12 }} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: text, fontSize: 16 }}>
                        <Text style={{ fontWeight: '800' }}>{req.fromName}</Text> sent you a friend request.
                      </Text>
                      {!!req.createdAt && <Text style={{ color: subtext, fontSize: 13, marginTop: 2 }}>{timeAgo(req.createdAt)}</Text>}
                      <View style={{ flexDirection: 'row', marginTop: 8 }}>
                        <TouchableOpacity onPress={() => acceptFriendRequest(req)} style={{ flex: 1, backgroundColor: accent, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginRight: 8 }}>
                          <Text style={{ color: '#fff', fontWeight: '800' }}>Confirm</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => rejectFriendRequest(req)} style={{ flex: 1, backgroundColor: pillBg, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                          <Text style={{ color: text, fontWeight: '800' }}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}

              {notifTab === 'requests' && messageRequests.length === 0 && (
                <Text style={{ color: subtext, textAlign: 'center', marginTop: 24 }}>No message requests.</Text>
              )}
              {notifTab === 'requests' &&
                messageRequests.map((c) => (
                  <View key={c.chatId} style={{ flexDirection: 'row', padding: 12 }}>
                    <TouchableOpacity onPress={() => openProfile(c.name, c.uid)}>
                      <Avatar uid={c.uid} name={c.name} size={56} bg={pillBg} color={accent} style={{ marginRight: 12 }} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: text, fontSize: 16 }}>
                        <Text style={{ fontWeight: '800' }}>{c.name}</Text> sent you a message request.
                      </Text>
                      <Text numberOfLines={2} style={{ color: subtext, fontSize: 14, marginTop: 2 }}>{c.lastMessage}</Text>
                      <View style={{ flexDirection: 'row', marginTop: 8 }}>
                        <TouchableOpacity onPress={() => acceptMessageRequest(c)} style={{ flex: 1, backgroundColor: accent, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginRight: 8 }}>
                          <Text style={{ color: '#fff', fontWeight: '800' }}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => declineMessageRequest(c)} style={{ flex: 1, backgroundColor: pillBg, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                          <Text style={{ color: text, fontWeight: '800' }}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
            </ScrollView>
          )}

          {notifTab === 'all' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} refreshControl={refreshControl}>
            {(() => {
              const millis = (n) => (n.createdAt && n.createdAt.toMillis ? n.createdAt.toMillis() : 0);
              const sorted = notifications.slice().sort((a, b) => millis(b) - millis(a));
              const fresh = sorted.filter((n) => !n.read);
              const earlier = sorted.filter((n) => n.read);
              const tint = darkMode ? '#143323' : '#e7f3ec';
              const bodyOf = (n) =>
                n.text ||
                (n.type === 'group_join_request'
                  ? `${n.fromName} requested to join ${n.groupName}.`
                  : n.type === 'group_joined'
                  ? `${n.fromName} joined ${n.groupName}.`
                  : n.type === 'group_join_approved'
                  ? `Your request to join ${n.groupName} was approved.`
                  : n.type === 'group_join_rejected'
                  ? `Your request to join ${n.groupName} was rejected.`
                  : 'You have a new notification.');
              const renderItem = (n) => {
                const who = n.from || n.fromName || 'Ascend';
                const body = bodyOf(n);
                const rest = body.startsWith(who) ? body.slice(who.length) : ` ${body}`;
                const req =
                  n.type === 'friend_request'
                    ? incomingRequests.find((r) => (n.fromUid ? r.fromUid === n.fromUid : r.fromName === who))
                    : null;
                return (
                  <View key={n.id} style={{ flexDirection: 'row', padding: 12, backgroundColor: n.read ? 'transparent' : tint }}>
                    <Avatar uid={n.fromUid} name={who} size={56} bg={pillBg} color={accent} style={{ marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: text, fontSize: 16, lineHeight: 22 }}>
                        <Text style={{ fontWeight: '800' }}>{who}</Text>
                        {rest}
                      </Text>
                      {!!n.createdAt && <Text style={{ color: subtext, fontSize: 13, marginTop: 2 }}>{timeAgo(n.createdAt)}</Text>}
                      {n.type === 'message_request' && (
                        <TouchableOpacity
                          onPress={() => {
                            setMessengerTab('requests');
                            setScreen('chat');
                          }}
                          style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 8, marginTop: 8 }}
                        >
                          <Text style={{ color: text, fontWeight: '800' }}>View</Text>
                        </TouchableOpacity>
                      )}
                      {!!req && (
                        <View style={{ flexDirection: 'row', marginTop: 8 }}>
                          <TouchableOpacity onPress={() => acceptFriendRequest(req)} style={{ flex: 1, backgroundColor: accent, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginRight: 8 }}>
                            <Text style={{ color: '#fff', fontWeight: '800' }}>Confirm</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => rejectFriendRequest(req)} style={{ flex: 1, backgroundColor: pillBg, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                            <Text style={{ color: text, fontWeight: '800' }}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                );
              };
              return (
                <>
                  {notifications.length === 0 && (
                    <Text style={{ color: subtext, textAlign: 'center', marginTop: 30 }}>No notifications yet.</Text>
                  )}
                  {fresh.length > 0 && <Text style={{ color: text, fontSize: 20, fontWeight: '800', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 }}>New</Text>}
                  {fresh.map(renderItem)}
                  {earlier.length > 0 && <Text style={{ color: text, fontSize: 20, fontWeight: '800', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 }}>Earlier</Text>}
                  {earlier.map(renderItem)}
                </>
              );
            })()}
          </ScrollView>
          )}
        </View>
      )}

      {screen === 'ranks' && (
        <ScrollView style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => setScreen('menu')}>
            <Text style={{ color: accent, fontWeight: '700', marginBottom: 12 }}>← Back to Menu</Text>
          </TouchableOpacity>
          <Text style={{ color: text, fontSize: 20, fontWeight: '700', marginBottom: 4 }}>{rank.stage} {rank.label}</Text>
          <Text style={{ color: subtext, marginBottom: 16 }}>
            {points} pts total{next ? ` · ${Math.max(0, rank.to - points)} pts to ${next.stage} ${next.label}` : ' · Max rank!'}
          </Text>

         <View
  style={{
    backgroundColor: cardBg,
    borderWidth: 1,
    borderColor: border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  }}
>
  <Text
    style={{
      color: text,
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 5,
    }}
  >
    🎬 Earn Ascend Points
  </Text>

  <Text
    style={{
      color: subtext,
      fontSize: 12,
      marginBottom: 12,
    }}
  >
    Watch an ad and earn +5 points.
    {'\n'}Ads watched today: {adsWatchedToday}/20
  </Text>

  <TouchableOpacity
    onPress={watchRewardedAd}
    style={{
      backgroundColor:
        adsWatchedToday >= 20 ? '#777' : accent,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    }}
  >
    <Text
      style={{
        color: '#fff',
        fontWeight: '700',
      }}
    >
      {adsWatchedToday >= 20
        ? 'Daily Limit Reached'
        : rewardedAdLoaded
        ? '🎬 Watch Ad (+5 Points)'
        : 'Loading Ad...'}
    </Text>
  </TouchableOpacity>
</View>

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
        <View style={{ flex: 1, marginHorizontal: -16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 }}>
            <TouchableOpacity onPress={() => setScreen('menu')} style={{ paddingRight: 8 }}>
              <Ionicons name="chevron-back" size={28} color={text} />
            </TouchableOpacity>
            <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', color: text, fontSize: 19, fontWeight: '800' }}>{user.name}</Text>
            <TouchableOpacity onPress={openEditProfile} style={{ padding: 6 }}>
              <Ionicons name="pencil" size={22} color={text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setScreen('search')} style={{ padding: 6 }}>
              <Ionicons name="search" size={22} color={text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setScreen('settings')} style={{ padding: 6 }}>
              <Ionicons name="ellipsis-horizontal" size={22} color={text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} refreshControl={refreshControl}>
            <View style={{ backgroundColor: cardBg, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={pickProfileImage}>
                  <Avatar uid={user.uid} photo={user.photo} name={user.name} size={100} bg={pillBg} color={accent} />
                  <View style={{ position: 'absolute', right: -2, bottom: 0, width: 34, height: 34, borderRadius: 17, backgroundColor: pillBg, borderWidth: 2, borderColor: cardBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="camera" size={18} color={text} />
                  </View>
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text numberOfLines={2} style={{ color: text, fontSize: 24, fontWeight: '800', flexShrink: 1 }}>{user.name}</Text>
                    {user.Verified === true && <VerifiedBadge size={22} />}
                  </View>
                  <Text style={{ color: text, fontSize: 15, marginTop: 4 }}>
                    <Text style={{ fontWeight: '800' }}>{realFriends.length}</Text> friends · <Text style={{ fontWeight: '800' }}>{myPosts.length}</Text> posts
                    {myOfficialPage ? <Text> · <Text style={{ fontWeight: '800' }}>{myOfficialPage.followersCount || 0}</Text> followers</Text> : null}
                  </Text>
                </View>
              </View>

              {!!user.location && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                  <Ionicons name="location" size={18} color={text} />
                  <Text style={{ color: text, fontSize: 16, fontWeight: '600', marginLeft: 6 }}>{user.location}</Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', marginTop: 14 }}>
                <TouchableOpacity
                  onPress={() => setStoryComposerOpen(true)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: accent, borderRadius: 10, paddingVertical: 12, marginRight: 8 }}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, marginLeft: 6 }}>Add to story</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={openEditProfile}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: pillBg, borderRadius: 10, paddingVertical: 12 }}
                >
                  <Ionicons name="pencil" size={18} color={text} />
                  <Text style={{ color: text, fontWeight: '800', fontSize: 16, marginLeft: 6 }}>Edit profile</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ flexDirection: 'row', backgroundColor: cardBg, marginTop: 8, borderBottomWidth: 1, borderColor: border }}>
              {[{ key: 'all', label: 'All' }, { key: 'photos', label: 'Photos' }, { key: 'reels', label: 'Reels' }].map((t) => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setProfileTab(t.key)}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 14, borderBottomWidth: 3, borderBottomColor: profileTab === t.key ? accent : 'transparent' }}
                >
                  <Text style={{ color: profileTab === t.key ? accent : subtext, fontWeight: '700', fontSize: 17 }}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {profileTab === 'all' && (
              <View>
                <View style={{ backgroundColor: cardBg, padding: 14, marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ color: text, fontSize: 20, fontWeight: '800' }}>Personal details</Text>
                    <TouchableOpacity onPress={openEditProfile}>
                      <Ionicons name="pencil-outline" size={22} color={subtext} />
                    </TouchableOpacity>
                  </View>
                  {[
                    !!user.location && { icon: 'location-outline', label: user.location },
                    !!user.bio && { icon: 'information-circle-outline', label: user.bio },
                    !!user.age && { icon: 'gift-outline', label: `${user.age} years old` },
                    !!user.gender && { icon: 'person-outline', label: user.gender },
                    { icon: 'trophy-outline', label: `${rank.stage} ${rank.label} · ${points} pts` },
                  ]
                    .filter(Boolean)
                    .map((row) => (
                      <View key={row.icon} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }}>
                        <Ionicons name={row.icon} size={26} color={text} />
                        <Text style={{ color: text, fontSize: 16, fontWeight: '600', marginLeft: 14, flex: 1 }}>{row.label}</Text>
                      </View>
                    ))}
                </View>

                <View style={{ backgroundColor: cardBg, padding: 14, marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Text style={{ color: text, fontSize: 20, fontWeight: '800' }}>Friends</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setFriendsTab('mine');
                        setScreen('friends');
                      }}
                    >
                      <Text style={{ color: accent, fontWeight: '700', fontSize: 16 }}>See all</Text>
                    </TouchableOpacity>
                  </View>
                  {realFriends.length === 0 && <Text style={{ color: subtext }}>No friends yet.</Text>}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {realFriends.slice(0, 6).map((f) => (
                      <TouchableOpacity key={f.uid} onPress={() => openProfile(f.name, f.uid)} style={{ width: '33.33%', alignItems: 'center', marginBottom: 12 }}>
                        <Avatar uid={f.uid} name={f.name} size={86} bg={pillBg} color={accent} />
                        <Text numberOfLines={2} style={{ color: text, fontWeight: '700', fontSize: 14, textAlign: 'center', marginTop: 6 }}>{f.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={{ backgroundColor: cardBg, padding: 14, marginTop: 8 }}>
                  <Text style={{ color: text, fontSize: 20, fontWeight: '800', marginBottom: 10 }}>Posts</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Avatar uid={user.uid} photo={user.photo} name={user.name} size={44} bg={pillBg} color={accent} />
                    <TouchableOpacity
                      onPress={() => {
                        setScreen('feed');
                        setComposerOpen(true);
                      }}
                      style={{ flex: 1, marginLeft: 10, backgroundColor: pillBg, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12 }}
                    >
                      <Text style={{ color: subtext, fontSize: 16 }}>Post a status update</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {myPosts.slice(0, 20).map((p) => (
                  <View key={p.id} style={{ backgroundColor: cardBg, marginTop: 8, padding: 14 }}>
                    <Text style={{ color: subtext, fontSize: 13 }}>{p.timestamp ? timeAgo(p.timestamp) : 'now'} · 🌍</Text>
                    {!!p.text && <Text style={{ color: text, fontSize: 17, lineHeight: 23, marginTop: 6 }}>{p.text}</Text>}
                    {p.media && p.media.type === 'image' && !!p.media.uri && (
                      <Image source={{ uri: p.media.uri }} style={{ width: '100%', height: 220, borderRadius: 8, marginTop: 8 }} />
                    )}
                    {p.media && p.media.type === 'video' && !!p.media.uri && <AscendVideoPlayer uri={p.media.uri} height={220} radius={8} />}
                    <Text style={{ color: subtext, marginTop: 8 }}>👍 {(p.likes || []).length}  ·  💬 {p.commentCount || 0}</Text>
                  </View>
                ))}
              </View>
            )}

            {profileTab === 'photos' && (
              <View style={{ backgroundColor: cardBg, marginTop: 8, padding: 4, flexDirection: 'row', flexWrap: 'wrap' }}>
                {myPosts.filter((p) => p.media && p.media.type === 'image' && !!p.media.uri).length === 0 && (
                  <Text style={{ color: subtext, padding: 14 }}>No photos yet.</Text>
                )}
                {myPosts
                  .filter((p) => p.media && p.media.type === 'image' && !!p.media.uri)
                  .map((p) => (
                    <Image key={p.id} source={{ uri: p.media.uri }} style={{ width: '33.33%', aspectRatio: 1, padding: 2 }} />
                  ))}
              </View>
            )}

            {profileTab === 'reels' && (
              <View>
                {myPosts.filter((p) => p.media && p.media.type === 'video' && !!p.media.uri).length === 0 && (
                  <Text style={{ color: subtext, padding: 14 }}>No reels or videos yet.</Text>
                )}
                {myPosts
                  .filter((p) => p.media && p.media.type === 'video' && !!p.media.uri)
                  .map((p) => (
                    <View key={p.id} style={{ backgroundColor: cardBg, marginTop: 8, padding: 14 }}>
                      <AscendVideoPlayer uri={p.media.uri} height={240} radius={8} />
                      {!!p.text && <Text style={{ color: text, fontSize: 16, marginTop: 8 }}>{p.text}</Text>}
                    </View>
                  ))}
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {screen === 'menu' && (
        <View style={{ flex: 1, marginHorizontal: -16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10 }}>
            <TouchableOpacity onPress={() => setScreen('feed')} style={{ paddingRight: 16, paddingVertical: 4 }} accessibilityLabel="Back">
              <Text style={{ color: text, fontSize: 34, fontWeight: '600', marginTop: -6 }}>‹</Text>
            </TouchableOpacity>
            <Text style={{ color: text, fontSize: 28, fontWeight: '800', flex: 1 }}>Menu</Text>
            <TouchableOpacity onPress={() => setScreen('chat')} style={circleStyle} accessibilityLabel="Search">
              <Text style={{ fontSize: 18 }}>🔍</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              onPress={() => setScreen('profile')}
              style={[{ backgroundColor: cardBg, borderWidth: 1, borderColor: border, borderRadius: 14 }, { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 10 }]}
            >
              <Avatar uid={user.uid} photo={user.photo} name={user.name} size={50} bg={pillBg} color={accent} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: text, fontSize: 19, fontWeight: '700' }}>{user.name}</Text>
                <Text style={{ color: subtext, fontSize: 15, marginTop: 1 }}>View your profile</Text>
                <Text style={{ color: accent, fontSize: 12.5, fontWeight: '700', marginTop: 2 }}>{points} pts · {rank.stage} {rank.label}</Text>
              </View>
              <TouchableOpacity onPress={() => setSwitchAccountOpen(true)} style={circleStyle} accessibilityLabel="Switch account">
                <Text style={{ color: text, fontSize: 20, fontWeight: '800', marginTop: -4 }}>⌄</Text>
              </TouchableOpacity>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={async () => {
                try {
                  await Share.share({ message: 'Join me on Ascend, the social app from MIDEON!' });
                } catch (error) {
                  // ignore
                }
              }}
              style={[{ backgroundColor: cardBg, borderWidth: 1, borderColor: border, borderRadius: 14 }, { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 10 }]}
            >
              <Text style={{ fontSize: 32, marginRight: 14 }}>❤️</Text>
              <Text style={{ color: text, fontSize: 19 }}>Invite friends</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {[
                { icon: '💬', label: 'Messages', go: 'chat' },
                { icon: '👥', label: 'Groups', go: 'search' },
                { icon: '🧑‍🤝‍🧑', label: 'Friends', go: 'friends' },
                { icon: '🎬', label: 'Videos', go: 'videos' },
                { icon: '🚩', label: 'Pages', go: 'pages' },
                { icon: '🏆', label: 'Ranks & points', go: 'ranks' },
                { icon: '⚙️', label: 'Account center', go: 'settings' },
                { icon: '❓', label: 'Help', go: 'ai' },
                { icon: '📜', label: 'Terms', go: 'terms' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.label}
                  onPress={() => setScreen(item.go)}
                  style={[{ backgroundColor: cardBg, borderWidth: 1, borderColor: border, borderRadius: 14 }, { width: '48.5%', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 16, marginBottom: 10 }]}
                >
                  <Text style={{ fontSize: 30, marginBottom: 10 }}>{item.icon}</Text>
                  <Text style={{ color: text, fontSize: 18 }}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[styles.button, { backgroundColor: '#555', marginTop: 6 }]} onPress={confirmLogout}>
              <Text style={styles.buttonText}>Log out</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {screen === 'pages' && (
        <ScrollView style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => setScreen('menu')}>
            <Text style={{ color: accent, fontWeight: '700', marginBottom: 16 }}>← Back to Menu</Text>
          </TouchableOpacity>
          <Text style={{ color: subtext, marginBottom: 14 }}>
            Create a page or follow one. A page stays up for {PAGE_LIFETIME_HOURS} hours.
          </Text>

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

        </ScrollView>
      )}

      {screen === 'settings' && (
        <ScrollView style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => setScreen('menu')}>
            <Text style={{ color: accent, fontWeight: '700', marginBottom: 16 }}>← Back to Menu</Text>
          </TouchableOpacity>

          <Text style={{ color: text, fontSize: 24, fontWeight: '800', marginBottom: 4 }}>Account center</Text>
          <Text style={{ color: subtext, marginBottom: 16 }}>Manage your username, phone number, email and password.</Text>

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

          <Text style={{ color: text, fontWeight: '700', marginTop: 16, marginBottom: 8 }}>Phone number</Text>
          {editPhoneVisible ? (
            <>
              <TextInput
                style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg }]}
                placeholder="+2348012345678"
                placeholderTextColor={subtext}
                keyboardType="phone-pad"
                value={editPhone}
                onChangeText={setEditPhone}
              />
              <TouchableOpacity style={[styles.button, { backgroundColor: accent }]} onPress={savePhone}>
                <Text style={styles.buttonText}>Save phone number</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditPhoneVisible(false)}>
                <Text style={{ color: accent, textAlign: 'center', marginTop: 8 }}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.settingRow, { borderColor: border }]}
              onPress={() => {
                setEditPhone(user?.phone || '');
                setEditPhoneVisible(true);
              }}
            >
              <Text style={{ color: text }}>{user?.phone ? user.phone : 'Add phone number'}</Text>
              <Text style={{ color: accent, fontWeight: '700' }}>{user?.phone ? 'Edit' : 'Add'}</Text>
            </TouchableOpacity>
          )}
          <Text style={{ color: subtext, fontSize: 11, marginTop: 4 }}>
            Your phone number is saved to your account but is not verified yet.
          </Text>

          <Text style={{ color: text, fontWeight: '700', marginTop: 16, marginBottom: 8 }}>Email</Text>
          {editEmailVisible ? (
            <>
              <TextInput
                style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg }]}
                placeholder="New email address"
                placeholderTextColor={subtext}
                keyboardType="email-address"
                autoCapitalize="none"
                value={editEmail}
                onChangeText={setEditEmail}
              />
              <TouchableOpacity style={[styles.button, { backgroundColor: accent }]} onPress={changeEmail}>
                <Text style={styles.buttonText}>Send verification link</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditEmailVisible(false)}>
                <Text style={{ color: accent, textAlign: 'center', marginTop: 8 }}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.settingRow, { borderColor: border }]}
              onPress={() => {
                setEditEmail('');
                setEditEmailVisible(true);
              }}
            >
              <Text style={{ color: text, flex: 1 }} numberOfLines={1}>{(auth.currentUser && auth.currentUser.email) || user?.email || 'No email'}</Text>
              <Text style={{ color: accent, fontWeight: '700' }}>Change</Text>
            </TouchableOpacity>
          )}

          <View style={[styles.settingRow, { borderColor: border }]}>
            <Text style={{ color: text }}>Dark mode</Text>
            <Switch value={darkMode} onValueChange={setDarkMode} />
          </View>

          <Text style={{ color: text, fontWeight: '700', marginTop: 20, marginBottom: 8 }}>Reset password</Text>
          
          <TouchableOpacity
  style={[styles.button, { backgroundColor: accent }]}
  onPress={requestResetCode}
>
  <Text style={styles.buttonText}>Send Password Reset Email</Text>
</TouchableOpacity>

          <TouchableOpacity style={[styles.button, { backgroundColor: border, marginTop: 10 }]} onPress={() => setScreen('terms')}>
            <Text style={{ color: text, fontWeight: 'bold' }}>Terms & Conditions</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: border, marginTop: 10 }]}
            onPress={() => {
              if (PRIVACY_POLICY_URL) {
                Linking.openURL(PRIVACY_POLICY_URL).catch(() => Alert.alert('Privacy policy', 'Could not open the link.'));
              } else {
                Alert.alert('Privacy policy', 'The privacy policy link has not been added yet.');
              }
            }}
          >
            <Text style={{ color: text, fontWeight: 'bold' }}>Privacy policy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, { backgroundColor: '#555' }]} onPress={confirmLogout}>
            <Text style={styles.buttonText}>Log out</Text>
          </TouchableOpacity>

          {deleteOpen ? (
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: subtext, marginBottom: 8 }}>
                Enter your password to permanently delete your account and your posts. This cannot be undone.
              </Text>
              <TextInput
                style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg }]}
                placeholder="Password"
                placeholderTextColor={subtext}
                secureTextEntry
                autoCapitalize="none"
                value={deletePassword}
                onChangeText={setDeletePassword}
              />
              <TouchableOpacity
                style={[styles.button, { backgroundColor: '#b91c1c' }]}
                onPress={deleteMyAccount}
                disabled={deleting}
              >
                <Text style={styles.buttonText}>{deleting ? 'Deleting...' : 'Permanently delete my account'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setDeleteOpen(false);
                  setDeletePassword('');
                }}
              >
                <Text style={{ color: accent, textAlign: 'center', marginTop: 8 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#b91c1c', marginTop: 10 }]}
              onPress={() => setDeleteOpen(true)}
            >
              <Text style={styles.buttonText}>Delete account</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}{screen === 'ai' && (
        <View style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => setScreen('feed')} style={{ marginBottom: 8 }}>
            <Text style={{ color: accent, fontWeight: '700' }}>← Back</Text>
          </TouchableOpacity>
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
  <VerifiedBadge />
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

<Modal
  visible={editProfileVisible}
  transparent
  animationType="slide"
  onRequestClose={() => setEditProfileVisible(false)}
>
  <View
    style={{
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    }}
  >
    <View
      style={{
        backgroundColor: cardBg,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        maxHeight: '85%',
      }}
    >
      <Text
        style={{
          color: text,
          fontSize: 20,
          fontWeight: '700',
          marginBottom: 16,
        }}
      >
        Edit Profile
      </Text>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={{ color: subtext, marginBottom: 5 }}>
          Bio
        </Text>

        <TextInput
          value={editBio}
          onChangeText={setEditBio}
          placeholder="Tell people about yourself"
          placeholderTextColor={subtext}
          multiline
          style={[
            styles.input,
            {
              borderColor: border,
              color: text,
              backgroundColor: bg,
              minHeight: 80,
              textAlignVertical: 'top',
            },
          ]}
        />

        <Text style={{ color: subtext, marginBottom: 5 }}>
          Age
        </Text>

        <TextInput
          value={editAge}
          onChangeText={setEditAge}
          placeholder="Your age"
          placeholderTextColor={subtext}
          keyboardType="number-pad"
          style={[
            styles.input,
            {
              borderColor: border,
              color: text,
              backgroundColor: bg,
            },
          ]}
        />

        <Text style={{ color: subtext, marginBottom: 5 }}>
          Gender
        </Text>

        <TextInput
          value={editGender}
          onChangeText={setEditGender}
          placeholder="Male, Female, Other..."
          placeholderTextColor={subtext}
          style={[
            styles.input,
            {
              borderColor: border,
              color: text,
              backgroundColor: bg,
            },
          ]}
        />

        <Text style={{ color: subtext, marginBottom: 5 }}>
          Location
        </Text>

        <TextInput
          value={editLocation}
          onChangeText={setEditLocation}
          placeholder="Where are you from?"
          placeholderTextColor={subtext}
          style={[
            styles.input,
            {
              borderColor: border,
              color: text,
              backgroundColor: bg,
            },
          ]}
        />

        <TouchableOpacity
          onPress={saveProfile}
          style={[
            styles.button,
            {
              backgroundColor: accent,
              marginTop: 10,
            },
          ]}
        >
          <Text style={styles.buttonText}>
            Save Profile
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setEditProfileVisible(false)}
          style={{
            alignItems: 'center',
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: subtext, fontWeight: '700' }}>
            Cancel
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  </View>
</Modal>

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

      <Modal visible={switchAccountOpen} transparent animationType="slide" onRequestClose={() => setSwitchAccountOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: cardBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ flex: 1, color: text, fontSize: 22, fontWeight: '800' }}>Switch account</Text>
              <TouchableOpacity onPress={() => setSwitchAccountOpen(false)}>
                <Ionicons name="close" size={28} color={text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
                <Avatar uid={user.uid} photo={user.photo} name={user.name} size={52} bg={pillBg} color={accent} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: text, fontSize: 17, fontWeight: '700' }}>{user.name}</Text>
                  <Text style={{ color: subtext, fontSize: 13 }}>Logged in now</Text>
                </View>
                <Ionicons name="checkmark-circle" size={26} color={accent} />
              </View>

              {savedAccounts
                .filter((a) => a.uid !== user.uid)
                .map((acct) => (
                  <TouchableOpacity
                    key={acct.uid}
                    onPress={() => loginSavedAccount(acct)}
                    disabled={!!switchingUid}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}
                  >
                    <Avatar uid={acct.uid} photo={acct.photo} name={acct.name} size={52} bg={pillBg} color={accent} style={{ marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: text, fontSize: 17, fontWeight: '700' }}>{acct.name}</Text>
                      <Text numberOfLines={1} style={{ color: subtext, fontSize: 13 }}>{switchingUid === acct.uid ? 'Switching...' : acct.email}</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeSavedAccount(acct)} style={{ padding: 8 }}>
                      <Ionicons name="close" size={22} color={subtext} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}

              {Platform.OS !== 'web' && !savedAccounts.some((a) => a.uid === user.uid) && (
                <TouchableOpacity
                  onPress={() => {
                    const known = lastPasswordRef.current;
                    if (known) {
                      saveCurrentAccount(known)
                        .then(() => Alert.alert('Saved', 'This account is saved on this phone.'))
                        .catch((error) => Alert.alert('Could not save', error.message));
                    } else {
                      setSaveThenLogout(false);
                      setSavePasswordInput('');
                      setSaveAccountOpen(true);
                    }
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: pillBg, borderRadius: 12, padding: 14, marginTop: 8 }}
                >
                  <Ionicons name="bookmark-outline" size={22} color={text} />
                  <Text style={{ color: text, fontWeight: '700', fontSize: 16, marginLeft: 10 }}>Save this account on this phone</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => {
                  setSwitchAccountOpen(false);
                  confirmLogout();
                }}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: pillBg, borderRadius: 12, padding: 14, marginTop: 8 }}
              >
                <Ionicons name="add-circle-outline" size={22} color={text} />
                <Text style={{ color: text, fontWeight: '700', fontSize: 16, marginLeft: 10 }}>Log into another account</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={saveAccountOpen} transparent animationType="fade" onRequestClose={() => setSaveAccountOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: cardBg, borderRadius: 16, padding: 20, width: '100%' }}>
            <Text style={{ color: text, fontSize: 18, fontWeight: '800', marginBottom: 8 }}>Save this account</Text>
            <Text style={{ color: subtext, marginBottom: 12 }}>
              Enter your password once. It is kept encrypted on this phone only, so you can switch accounts quickly.
            </Text>
            <TextInput
              style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg }]}
              placeholder="Password"
              placeholderTextColor={subtext}
              secureTextEntry
              autoCapitalize="none"
              value={savePasswordInput}
              onChangeText={setSavePasswordInput}
            />
            <TouchableOpacity
              style={[styles.button, { backgroundColor: accent }]}
              onPress={confirmSaveAccount}
              disabled={savingAccount}
            >
              <Text style={styles.buttonText}>{savingAccount ? 'Saving...' : saveThenLogout ? 'Save and log out' : 'Save account'}</Text>
            </TouchableOpacity>
            {saveThenLogout && (
              <TouchableOpacity
                onPress={() => {
                  setSaveAccountOpen(false);
                  setSavePasswordInput('');
                  setSaveThenLogout(false);
                  doLogout();
                }}
                style={{ alignItems: 'center', paddingTop: 10 }}
              >
                <Text style={{ color: subtext, fontWeight: '700' }}>Log out without saving</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => {
                setSaveAccountOpen(false);
                setSavePasswordInput('');
                setSaveThenLogout(false);
              }}
              style={{ alignItems: 'center', paddingTop: 10 }}
            >
              <Text style={{ color: accent, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={storyComposerOpen} animationType="slide" onRequestClose={() => setStoryComposerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: storyMedia ? '#000' : STORY_BGS[storyBgIndex % STORY_BGS.length] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 44, paddingHorizontal: 14, paddingBottom: 8 }}>
            <TouchableOpacity onPress={() => setStoryComposerOpen(false)}>
              <Ionicons name="close" size={30} color="#fff" />
            </TouchableOpacity>
            <Text style={{ flex: 1, color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' }}>Create story</Text>
            <TouchableOpacity onPress={shareStory} disabled={storyPosting} style={{ backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ color: '#111', fontWeight: '800' }}>{storyPosting ? 'Sharing...' : 'Share'}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
            {storyMedia && storyMedia.type === 'image' && (
              <Image source={{ uri: storyMedia.uri }} style={{ width: '100%', height: '70%' }} resizeMode="contain" />
            )}
            {storyMedia && storyMedia.type === 'video' && (
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <Ionicons name="videocam" size={64} color="#fff" />
                <Text style={{ color: '#fff', marginTop: 6 }}>Video ready to share</Text>
              </View>
            )}
            <TextInput
              multiline
              value={storyText}
              onChangeText={setStoryText}
              placeholder={storyMedia ? 'Add a caption...' : 'Type something...'}
              placeholderTextColor="rgba(255,255,255,0.7)"
              style={{ color: '#fff', fontSize: storyMedia ? 18 : 30, fontWeight: '800', textAlign: 'center', width: '100%', maxHeight: 240 }}
            />
            {!!storyMusic.trim() && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginTop: 12 }}>
                <Ionicons name="musical-notes" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>{storyMusic}</Text>
              </View>
            )}
          </View>

          <View style={{ paddingHorizontal: 14, paddingBottom: 30 }}>
            <TextInput
              value={storyMusic}
              onChangeText={setStoryMusic}
              placeholder="Add music (song title)"
              placeholderTextColor="rgba(255,255,255,0.7)"
              style={{ color: '#fff', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 12 }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={pickStoryMedia} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, marginRight: 10 }}>
                <Ionicons name="images-outline" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>Photo / Video</Text>
              </TouchableOpacity>
              {!!storyMedia && (
                <TouchableOpacity onPress={() => setStoryMedia(null)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 }}>
                  <Ionicons name="text" size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>Text</Text>
                </TouchableOpacity>
              )}
              {!storyMedia && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {STORY_BGS.map((c, i) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setStoryBgIndex(i)}
                      style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: 2, borderColor: i === storyBgIndex ? '#fff' : 'rgba(255,255,255,0.35)', marginRight: 8 }}
                    />
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!storyViewer} animationType="fade" onRequestClose={() => setStoryViewer(null)}>
        {(() => {
          const group = storyViewer ? storyGroups.find((g) => g.uid === storyViewer.uid) : null;
          const item = group ? group.items[storyViewer.index] : null;
          if (!group || !item) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
          const goNext = () =>
            setStoryViewer((c) => (c && c.index + 1 < group.items.length ? { ...c, index: c.index + 1 } : null));
          const goPrev = () => setStoryViewer((c) => (c && c.index > 0 ? { ...c, index: c.index - 1 } : c));
          return (
            <View style={{ flex: 1, backgroundColor: item.type === 'text' ? STORY_BGS[(item.bgIndex || 0) % STORY_BGS.length] : '#000' }}>
              <View style={{ flexDirection: 'row', paddingTop: 44, paddingHorizontal: 10 }}>
                {group.items.map((it, i) => (
                  <View key={it.id} style={{ flex: 1, height: 3, borderRadius: 2, marginHorizontal: 2, backgroundColor: i <= storyViewer.index ? '#fff' : 'rgba(255,255,255,0.35)' }} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
                <Avatar uid={group.uid} name={group.name} size={40} bg="rgba(255,255,255,0.25)" color="#fff" style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{group.uid === user.uid ? 'Your story' : group.name}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{item.createdAt ? timeAgo(item.createdAt) : 'now'}</Text>
                </View>
                <TouchableOpacity onPress={() => setStoryViewer(null)}>
                  <Ionicons name="close" size={30} color="#fff" />
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                {item.type === 'image' && !!item.mediaUrl && (
                  <Image source={{ uri: item.mediaUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                )}
                {item.type === 'video' && !!item.mediaUrl && <AscendVideoPlayer uri={item.mediaUrl} height={520} radius={0} />}
                {!!item.text && (
                  <Text style={{ position: item.type === 'text' ? 'relative' : 'absolute', bottom: item.type === 'text' ? undefined : 60, color: '#fff', fontSize: item.type === 'text' ? 30 : 18, fontWeight: '800', textAlign: 'center', paddingHorizontal: 24 }}>{item.text}</Text>
                )}
                {!!item.music && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginTop: 14, position: item.type === 'text' ? 'relative' : 'absolute', bottom: item.type === 'text' ? undefined : 16 }}>
                    <Ionicons name="musical-notes" size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>{item.music}</Text>
                  </View>
                )}
                <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' }}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={goPrev} />
                  <TouchableOpacity style={{ flex: 2 }} onPress={goNext} />
                </View>
              </View>
            </View>
          );
        })()}
      </Modal>

      <Modal
        visible={!!updateInfo}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!updateInfo?.force) setUpdateInfo(null);
        }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: cardBg, borderRadius: 16, padding: 20, width: '100%' }}>
            <Text style={{ color: text, fontSize: 18, fontWeight: '800', marginBottom: 8 }}>Update available</Text>
            <Text style={{ color: subtext, marginBottom: 16 }}>
              {updateInfo?.message}
              {updateInfo?.latest ? `\n\nNewest version: ${updateInfo.latest}` : ''}
            </Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: accent, marginBottom: 8 }]}
              onPress={() => {
                if (updateInfo?.url) {
                  Linking.openURL(updateInfo.url).catch(() => Alert.alert('Update', 'Could not open the update link.'));
                } else {
                  Alert.alert('Update', 'The download link has not been set yet.');
                }
              }}
            >
              <Text style={styles.buttonText}>Update now</Text>
            </TouchableOpacity>
            {!updateInfo?.force && (
              <TouchableOpacity onPress={() => setUpdateInfo(null)} style={{ alignItems: 'center', paddingVertical: 8 }}>
                <Text style={{ color: subtext, fontWeight: '700' }}>Later</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!viewProfileFor} animationType="slide" onRequestClose={() => setViewProfileFor(null)}>
        <View style={{ flex: 1, backgroundColor: bg }}>
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={{ height: 140, backgroundColor: accent }}>
              <TouchableOpacity
                onPress={() => setViewProfileFor(null)}
                style={{ position: 'absolute', top: 50, left: 16, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>← Back</Text>
              </TouchableOpacity>
            </View>

            <View style={{ alignItems: 'center', marginTop: -52, paddingHorizontal: 20 }}>
              <View style={{ borderWidth: 4, borderColor: bg, borderRadius: 56 }}>
                <Avatar uid={viewProfileData?.uid} photo={viewProfileData?.photo} name={viewProfileData?.name || viewProfileFor} size={104} bg={cardBg} color={accent} />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                <Text style={{ color: text, fontWeight: '800', fontSize: 22 }}>
                  {viewProfileData?.name || viewProfileFor}
                </Text>
                {viewProfileData?.Verified === true && (
                  <VerifiedBadge />
                )}
              </View>

              {!!viewProfileData && (
                <>
                  <Text style={{ color: accent, fontWeight: '700', marginTop: 4 }}>
                    {profileRank.stage} {profileRank.label}
                  </Text>
                  {!!viewProfileData.bio && (
                    <Text style={{ color: text, marginTop: 10, textAlign: 'center' }}>{viewProfileData.bio}</Text>
                  )}
                  {!!viewProfileData.location && (
                    <Text style={{ color: subtext, fontSize: 13, marginTop: 6 }}>📍 {viewProfileData.location}</Text>
                  )}
                  {(!!viewProfileData.age || !!viewProfileData.gender) && (
                    <Text style={{ color: subtext, fontSize: 12.5, marginTop: 4 }}>
                      {viewProfileData.age ? `${viewProfileData.age} years old` : ''}
                      {viewProfileData.age && viewProfileData.gender ? ' • ' : ''}
                      {viewProfileData.gender || ''}
                    </Text>
                  )}
                </>
              )}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 18, paddingVertical: 12, marginHorizontal: 16, borderRadius: 14, backgroundColor: cardBg, borderWidth: 1, borderColor: border }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: text, fontWeight: '800', fontSize: 18 }}>{profilePosts.length}</Text>
                <Text style={{ color: subtext, fontSize: 12 }}>Posts</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: text, fontWeight: '800', fontSize: 18 }}>{Number(viewProfileData?.points || 0)}</Text>
                <Text style={{ color: subtext, fontSize: 12 }}>Points</Text>
              </View>
            </View>

            {!!viewProfileData?.uid && viewProfileData.uid !== user?.uid && (
              <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 14 }}>
                {realFriends.some((f) => f.uid === viewProfileData.uid) ? (
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
                    onPress={() => {
                      const friend = realFriends.find((f) => f.uid === viewProfileData.uid);
                      setViewProfileFor(null);
                      if (friend) openPrivateChat(friend);
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>💬 Message</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
                      onPress={() => sendFriendRequest(viewProfileData)}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>➕ Add friend</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: pillBg, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
                      onPress={() => startMessageRequest(viewProfileData)}
                    >
                      <Text style={{ color: text, fontWeight: '700' }}>💬 Message</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            <Text style={{ color: text, fontWeight: '700', fontSize: 16, marginTop: 20, marginBottom: 8, marginHorizontal: 16 }}>Posts</Text>
            {profilePosts.length === 0 && (
              <Text style={{ color: subtext, marginHorizontal: 16 }}>No posts yet.</Text>
            )}
            {profilePosts.slice(0, 20).map((p) => (
              <View key={p.id} style={[styles.card, { backgroundColor: cardBg, borderColor: border, marginHorizontal: 16 }]}>
                {!!p.text && <Text style={{ color: text }}>{p.text}</Text>}
                {p.media?.uri && p.media?.type === 'photo' && (
                  <Image source={{ uri: p.media.uri }} style={{ width: '100%', height: 180, borderRadius: 10, marginTop: 8 }} />
                )}
                {p.media?.uri && p.media?.type !== 'photo' && (
                  <Text style={{ color: subtext, marginTop: 6 }}>🎥 Video post</Text>
                )}
                <Text style={{ color: subtext, fontSize: 12, marginTop: 8 }}>
                  ❤️ {(p.likes || []).length}   💬 {p.commentCount || 0}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {!(screen === 'chat' && (activeGroup || activePrivateFriend || groupChatOpen)) && (
        <View style={{ flexDirection: 'row', backgroundColor: cardBg, borderTopWidth: 1, borderColor: border, marginHorizontal: -16, paddingTop: 6, paddingBottom: 8 }}>
          {[
            { key: 'feed', label: 'Home', icon: 'home' },
            { key: 'friends', label: 'Friends', icon: 'people', badge: incomingRequests.length },
            { key: 'chat', label: 'Messages', icon: 'chatbubble-ellipses', badge: messageRequests.length },
            { key: 'videos', label: 'Video', icon: 'play-circle' },
            { key: 'notifications', label: 'Notifications', icon: 'notifications', badge: unreadCount },
            { key: 'menu', label: 'Menu', icon: 'menu' },
          ].map((tab) => {
            const active =
              tab.key === 'menu'
                ? ['menu', 'profile', 'settings', 'ranks', 'pages', 'ai', 'terms', 'search'].includes(screen)
                : screen === tab.key;
            const iconName = tab.key === 'menu' ? 'menu' : active ? tab.icon : `${tab.icon}-outline`;
            return (
              <TouchableOpacity key={tab.key} onPress={() => goTab(tab.key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 2 }}>
                <View>
                  <Ionicons name={iconName} size={26} color={active ? accent : subtext} />
                  {!!tab.badge && (
                    <View style={{ position: 'absolute', top: -4, right: -10, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: '#e11d48', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                      <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800' }}>{tab.badge > 99 ? '99+' : tab.badge}</Text>
                    </View>
                  )}
                </View>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: active ? accent : subtext, fontSize: 10, fontWeight: active ? '800' : '600', marginTop: 2 }}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, paddingTop: 60, paddingHorizontal: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: 'bold' },
  input: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
  button: { padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  smallButton: { padding: 8, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  rankRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  nav: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, paddingVertical: 10 },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 6 },
});
