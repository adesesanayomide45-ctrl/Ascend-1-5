import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Switch, Image, Alert, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';import { auth } from './firebaseConfig';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

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
- Missing a full day without logging in: -30 points
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
  if (t.includes('point')) return "You earn points by posting (+2), logging in daily (+40), and adding mutual friends (+5). Missing a full day without logging in costs -30.";
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
  const [points, setPoints] = useState(40);
  const [darkMode, setDarkMode] = useState(false);
  const [posts, setPosts] = useState([
    { id: 1, author: 'Ada', text: 'Hello world', media: null },
    { id: 2, author: 'Marco', text: 'Check out this clip', media: { uri: null, type: 'video' } },
  ]);
  const [draft, setDraft] = useState('');
  const [draftMedia, setDraftMedia] = useState(null);
  const [friends, setFriends] = useState(['Ada', 'Marco', 'Zainab']);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [profileMenuFor, setProfileMenuFor] = useState(null);
  const [viewProfileFor, setViewProfileFor] = useState(null);

  const [chats, setChats] = useState([
    { id: 1, name: 'Ada', online: true, messages: [
      { id: 1, from: 'them', text: 'Hey! You around later?', read: true },
      { id: 2, from: 'me', text: 'Yeah, free after 5', read: true },
      { id: 3, from: 'them', text: 'See you at 6?', read: false },
    ]},
    { id: 2, name: 'Marco', online: false, messages: [
      { id: 1, from: 'them', text: 'Sent the files', read: true },
    ]},
  ]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [chatDraft, setChatDraft] = useState('');

  const [aiMessages, setAiMessages] = useState([
    { id: 1, from: 'bot', text: "Hey! I'm the Ascend Help Bot. Ask me about points, ranks, posting, reels, friends, rules, your account, or how anything in the app works." },
  ]);
  const [aiDraft, setAiDraft] = useState('');

  const [resetVisible, setResetVisible] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetInput, setResetInput] = useState('');

  const bg = darkMode ? '#141119' : '#f0f2ee';
  const cardBg = darkMode ? '#1c1f16' : '#ffffff';
  const text = darkMode ? '#f0f0f0' : '#161b15';
  const subtext = darkMode ? '#9aa393' : '#657160';
  const accent = '#1E8449';
  const border = darkMode ? '#2a3020' : '#e1e8dc';const [appReady, setAppReady] = useState(false);
  const [loadingDots, setLoadingDots] = useState('.');

  useEffect(() => {
    const dotTimer = setInterval(() => {
      setLoadingDots((d) => (d.length >= 3 ? '.' : d + '.'));
    }, 400);
    const readyTimer = setTimeout(() => setAppReady(true), 1800);
    return () => { clearInterval(dotTimer); clearTimeout(readyTimer); };
  }, []);

  const rank = getRank(points);
  const idx = LEVELS.findIndex((l) => l === rank);
  const next = LEVELS[idx + 1];
  const activeChat = chats.find((c) => c.id === activeChatId);
  const visiblePosts = posts.filter((p) => !blockedUsers.includes(p.author));
  const videoPosts = visiblePosts.filter((p) => p.media && p.media.type === 'video');const pickMedia = async () => {
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

  const addPost = () => {
    if (!draft.trim() && !draftMedia) return;
    if (BLOCKED_WORDS.some((w) => draft.toLowerCase().includes(w))) {
      Alert.alert('Post blocked', 'Your post contains language that violates our content policy. Please edit it before posting.');
      return;
    }
    setPosts([{ id: Date.now(), author: user.name, text: draft, media: draftMedia }, ...posts]);
    setPoints(points + 2);
    setDraft('');
    setDraftMedia(null);
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

  const openProfile = (name) => {
    setProfileMenuFor(null);
    setViewProfileFor(name);
  };const sendChatMessage = () => {
    if (!chatDraft.trim() || !activeChatId) return;
    const msgId = Date.now();
    setChats((prev) => prev.map((c) => c.id === activeChatId
      ? { ...c, messages: [...c.messages, { id: msgId, from: 'me', text: chatDraft, read: false }] }
      : c));
    setChatDraft('');
    setTimeout(() => {
      setChats((prev) => prev.map((c) => c.id === activeChatId
        ? { ...c, messages: c.messages.map((m) => m.id === msgId ? { ...m, read: true } : m) }
        : c));
    }, 1500);
  };

  const sendVoiceNote = () => {
    if (!activeChatId) return;
    const msgId = Date.now();
    setChats((prev) => prev.map((c) => c.id === activeChatId
      ? { ...c, messages: [...c.messages, { id: msgId, from: 'me', text: '🎤 Voice note · 0:05', read: false }] }
      : c));
    setTimeout(() => {
      setChats((prev) => prev.map((c) => c.id === activeChatId
        ? { ...c, messages: c.messages.map((m) => m.id === msgId ? { ...m, read: true } : m) }
        : c));
    }, 1500);
  };

  const sendAiMessage = () => {
    if (!aiDraft.trim()) return;
    const question = aiDraft;
    setAiMessages((prev) => [...prev, { id: Date.now(), from: 'user', text: question }]);
    setAiDraft('');
    setTimeout(() => {
      setAiMessages((prev) => [...prev, { id: Date.now() + 1, from: 'bot', text: getBotReply(question) }]);
    }, 700);
  };

  const generateCode = () => String(Math.floor(1000 + Math.random() * 9000));
const requestSignupCode = () => {
    if (!genderInput.trim() || !ageInput.trim() || !emailInput.trim() || !passInput.trim()) {
      Alert.alert('Missing info', 'Please fill in your gender, age, email, and password first.');
      return;
    }
    Alert.alert('Verify your account', 'How should we send your verification code?', [
      { text: 'Via Email', onPress: () => { const c = generateCode(); setSignupCode(c); setSignupStage('code'); Alert.alert('Demo code', `Since Ascend has no real email service yet, here's your code: ${c}`); } },
      { text: 'Via Phone', onPress: () => { const c = generateCode(); setSignupCode(c); setSignupStage('code'); Alert.alert('Demo code', `Since Ascend has no real SMS service yet, here's your code: ${c}`); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const verifySignupCode = () => {
    if (codeInput !== signupCode) {
      Alert.alert('Incorrect code', 'That code doesn\'t match. Please try again.');
      return;
    }
    setUser({ name: nameInput, gender: genderInput, age: ageInput, email: emailInput, location: '', photo: null, profileComplete: false });
  };

  const requestResetCode = () => {
    Alert.alert('Reset password', 'How should we send your code?', [
      { text: 'Via Email', onPress: () => { const c = generateCode(); setResetCode(c); setResetVisible(true); Alert.alert('Demo code', `Here's your reset code: ${c}`); } },
      { text: 'Via Phone', onPress: () => { const c = generateCode(); setResetCode(c); setResetVisible(true); Alert.alert('Demo code', `Here's your reset code: ${c}`); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const verifyResetCode = () => {
    if (resetInput !== resetCode) {
      Alert.alert('Incorrect code', 'That code doesn\'t match. Please try again.');
      return;
    }
    Alert.alert('Success', 'Your password has been reset.');
    setResetVisible(false);
    setResetInput('');
  };
  if (!appReady) {
    return (
      <View style={[styles.app, { backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={[styles.title, { color: accent, fontSize: 30 }]}>Ascend</Text>
        <Text style={{ color: subtext, marginTop: 10, fontSize: 16, fontWeight: '700' }}>{loadingDots}</Text>
      </View>
    );
}const handleSignup = async () => {
    if (!genderInput.trim() || !ageInput.trim() || !emailInput.trim() || !passInput.trim()) {
      Alert.alert('Missing info', 'Please fill in your gender, age, email, and password first.');
      return;
    }
    try {
      await createUserWithEmailAndPassword(auth, emailInput, passInput);
      setUser({ name: nameInput, gender: genderInput, age: ageInput, email: emailInput, location: '', photo: null, profileComplete: false });
    } catch (error) {
      Alert.alert('Sign up failed', error.message);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, emailInput, passInput);
      setUser({ name: 'You', email: emailInput });
    } catch (error) {
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
            <TouchableOpacity style={[styles.button, { backgroundColor: accent }]} onPress={handleSignup}>
              <Text style={styles.buttonText}>Create Account</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSignupStage('name')}>
              <Text style={{ color: accent, textAlign: 'center', marginTop: 4 }}>← Back</Text>
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
            <TouchableOpacity style={[styles.button, { backgroundColor: accent }]} onPress={authMode === 'signup' ? handleSignup : handleLogin}>
              <Text style={styles.buttonText}>Log in</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setSignupStage('form'); }}>
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
        <Text style={{ color: text, fontWeight: '700' }}>{points} pts · {rank.stage} {rank.label}</Text>
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
                    <Text style={{ color: text, fontWeight: '700' }}>{p.author}</Text>
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
                    ? <View style={{ height: 160, borderRadius: 10, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 26 }}>🎥</Text></View>
                    : <Image source={{ uri: p.media.uri }} style={{ width: '100%', height: 180, borderRadius: 10 }} />
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
      )}{screen === 'chat' && !activeChatId && (
        <ScrollView style={{ flex: 1 }}>
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
            <Text style={{ color: text, fontSize: 19, fontWeight: '700', marginTop: 8 }}>{user.name}</Text>
            {!!user.location && <Text style={{ color: subtext, fontSize: 12.5 }}>{user.location}</Text>}
            <View style={{ backgroundColor: accent, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 3, marginTop: 6 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12.5 }}>{rank.stage} {rank.label} · {points} pts</Text>
            </View>
            <Text style={{ color: subtext, marginTop: 4, fontSize: 12.5 }}>Rank shown to anyone viewing this profile</Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: border, paddingVertical: 14 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: text, fontWeight: '700', fontSize: 16 }}>{posts.filter(p => p.author === user.name).length}</Text>
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
          {resetVisible && (
            <>
              <TextInput style={[styles.input, { borderColor: border, color: text, backgroundColor: cardBg, textAlign: 'center', letterSpacing: 4 }]} placeholder="Enter code" placeholderTextColor={subtext} keyboardType="number-pad" value={resetInput} onChangeText={setResetInput} />
              <TouchableOpacity style={[styles.button, { backgroundColor: accent }]} onPress={verifyResetCode}>
                <Text style={styles.buttonText}>Verify Code</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={[styles.button, { backgroundColor: border, marginTop: 10 }]} onPress={() => setScreen('terms')}>
            <Text style={{ color: text, fontWeight: 'bold' }}>Terms & Conditions</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, { backgroundColor: '#C2403F' }]} onPress={() => setPoints(Math.max(0, points - 30))}>
            <Text style={styles.buttonText}>Simulate missing a day (-30)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, { backgroundColor: '#555' }]} onPress={() => setUser(null)}>
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

      {screen === 'terms' && (
        <ScrollView style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => setScreen('settings')}>
            <Text style={{ color: accent, fontWeight: '700', marginBottom: 12 }}>← Back to Settings</Text>
          </TouchableOpacity>
          <Text style={{ color: text, lineHeight: 21 }}>{TERMS_TEXT}</Text>
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
                <Text style={{ color: accent, fontWeight: '700', fontSize: 22 }}>{viewProfileFor?.charAt(0)}</Text>
              </View>
              <Text style={{ color: text, fontWeight: '700', fontSize: 18 }}>{viewProfileFor}</Text>
              {viewProfileFor && FRIEND_INFO[viewProfileFor] && (
                <>
                  <Text style={{ color: subtext, fontSize: 13, marginTop: 2 }}>{FRIEND_INFO[viewProfileFor].location}</Text>
                  <View style={{ backgroundColor: accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginTop: 6 }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{FRIEND_INFO[viewProfileFor].rank}</Text>
                  </View>
                  <Text style={{ color: text, marginTop: 10, textAlign: 'center' }}>{FRIEND_INFO[viewProfileFor].bio}</Text>
                  <Text style={{ color: subtext, fontSize: 12, marginTop: 4 }}>Age {FRIEND_INFO[viewProfileFor].age}</Text>
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
