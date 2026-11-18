// 슬터디 — 코스와 단원 (화면과 서버가 함께 쓴다)
// vocab: [배울 말, 한국어 뜻, (읽는 법)]   sentences: { t: [낱말 조각…], ko: 한국어 뜻 }
// 내장 자료가 있는 단원은 AI 없이도 레슨이 만들어진다. 없는 단원은 AI가 만든다.

export const LESSONS_PER_UNIT = 4;

const words = (s) => s.replace(/[.,!?¡¿]/g, '').split(' ');
const en = (text, ko) => ({ t: words(text), ko, text });

export const COURSES = [
  {
    id: 'en', name: '영어', badge: 'EN', color: '#4f9cf9', lang: 'en-US', kind: 'language', langName: '영어',
    units: [
      {
        title: '인사하기', desc: 'Hello! 처음 만났을 때',
        vocab: [['hello', '안녕하세요'], ['goodbye', '잘 가요'], ['thank you', '고마워요'], ['yes', '네'], ['no', '아니요'],
          ['please', '부탁해요'], ['sorry', '미안해요'], ['good morning', '좋은 아침'], ['good night', '잘 자요'], ['friend', '친구']],
        sentences: [en('Hello, my friend.', '안녕, 내 친구야.'), en('Thank you very much.', '정말 고마워요.'),
          en('Good morning, Mom.', '좋은 아침이에요, 엄마.'), en('I am sorry.', '미안해요.'), en('See you tomorrow.', '내일 봐요.'),
          en('Yes, please.', '네, 부탁해요.')]
      },
      {
        title: '나를 소개해요', desc: 'I am… 이름과 나이',
        vocab: [['I', '나'], ['you', '너'], ['name', '이름'], ['student', '학생'], ['teacher', '선생님'],
          ['Korea', '한국'], ['happy', '행복한'], ['boy', '소년'], ['girl', '소녀'], ['nice to meet you', '만나서 반가워요']],
        sentences: [en('My name is Minsu.', '내 이름은 민수예요.'), en('I am a student.', '나는 학생이에요.'),
          en('I am from Korea.', '나는 한국에서 왔어요.'), en('You are my teacher.', '당신은 내 선생님이에요.'),
          en('Nice to meet you.', '만나서 반가워요.'), en('I am happy.', '나는 행복해요.')]
      },
      { title: '숫자', desc: 'one, two, three…' },
      { title: '음식', desc: '좋아하는 음식 말하기' },
      { title: '가족', desc: '엄마, 아빠, 형제' },
      { title: '하루 일과', desc: '일어나고, 먹고, 자고' },
      { title: '학교', desc: '교실과 수업' },
      { title: '쇼핑', desc: '얼마예요?' },
      { title: '날씨', desc: '오늘 날씨 어때?' },
      { title: '취미', desc: '좋아하는 것 말하기' },
      { title: '여행', desc: '길 묻기, 공항' },
      { title: '감정', desc: '기분 표현하기' }
    ]
  },
  {
    id: 'ja', name: '일본어', badge: 'あ', color: '#ff6b8a', lang: 'ja-JP', kind: 'language', langName: '일본어',
    units: [
      {
        title: '히라가나 1', desc: 'あいうえお かきくけこ',
        vocab: [['あ', '아', 'a'], ['い', '이', 'i'], ['う', '우', 'u'], ['え', '에', 'e'], ['お', '오', 'o'],
          ['か', '카', 'ka'], ['き', '키', 'ki'], ['く', '쿠', 'ku'], ['け', '케', 'ke'], ['こ', '코', 'ko']],
        sentences: [{ t: ['あ', 'い'], ko: '사랑 (あい)', text: 'あい' }, { t: ['い', 'え'], ko: '집 (いえ)', text: 'いえ' },
          { t: ['か', 'お'], ko: '얼굴 (かお)', text: 'かお' }, { t: ['こ', 'い'], ko: '잉어 (こい)', text: 'こい' },
          { t: ['あ', 'か', 'い'], ko: '빨간 (あかい)', text: 'あかい' }]
      },
      {
        title: '인사하기', desc: 'こんにちは!',
        vocab: [['こんにちは', '안녕하세요', 'konnichiwa'], ['おはよう', '좋은 아침', 'ohayou'], ['こんばんは', '좋은 저녁', 'konbanwa'],
          ['ありがとう', '고마워요', 'arigatou'], ['さようなら', '안녕히 가세요', 'sayounara'], ['すみません', '죄송해요', 'sumimasen'],
          ['はい', '네', 'hai'], ['いいえ', '아니요', 'iie'], ['おやすみ', '잘 자', 'oyasumi'], ['ともだち', '친구', 'tomodachi']],
        sentences: [{ t: ['ありがとう', 'ございます'], ko: '감사합니다', text: 'ありがとうございます' },
          { t: ['おはよう', 'ございます'], ko: '안녕하세요 (아침)', text: 'おはようございます' },
          { t: ['はい', '、', 'そうです'], ko: '네, 그래요', text: 'はい、そうです' },
          { t: ['また', 'ね'], ko: '또 봐', text: 'またね' },
          { t: ['ともだち', 'です'], ko: '친구예요', text: 'ともだちです' }]
      },
      { title: '히라가나 2', desc: 'さしすせそ たちつてと' },
      { title: '자기소개', desc: 'わたしは…です' },
      { title: '숫자', desc: 'いち、に、さん' },
      { title: '음식', desc: 'すし、ラーメン' },
      { title: '가족', desc: 'おかあさん、おとうさん' },
      { title: '가타카나', desc: 'アイウエオ' },
      { title: '일상', desc: '먹다, 가다, 보다' },
      { title: '쇼핑', desc: 'いくらですか?' },
      { title: '여행', desc: '역, 길 묻기' }
    ]
  },
  {
    id: 'zh', name: '중국어', badge: '中', color: '#f2a93b', lang: 'zh-CN', kind: 'language', langName: '중국어(간체, 병음 포함)',
    units: [
      {
        title: '인사하기', desc: '你好!',
        vocab: [['你好', '안녕하세요', 'nǐ hǎo'], ['谢谢', '고마워요', 'xièxie'], ['再见', '잘 가요', 'zàijiàn'], ['对不起', '미안해요', 'duìbuqǐ'],
          ['是', '네 / ~이다', 'shì'], ['不', '아니', 'bù'], ['我', '나', 'wǒ'], ['你', '너', 'nǐ'], ['朋友', '친구', 'péngyou'], ['老师', '선생님', 'lǎoshī']],
        sentences: [{ t: ['你', '好'], ko: '안녕하세요', text: '你好' }, { t: ['谢谢', '你'], ko: '고마워', text: '谢谢你' },
          { t: ['我', '是', '学生'], ko: '나는 학생이에요', text: '我是学生' }, { t: ['你', '是', '老师'], ko: '당신은 선생님이에요', text: '你是老师' },
          { t: ['我', '的', '朋友'], ko: '내 친구', text: '我的朋友' }]
      },
      { title: '자기소개', desc: '我叫…' },
      { title: '숫자', desc: '一、二、三' },
      { title: '음식', desc: '吃饭' },
      { title: '가족', desc: '妈妈、爸爸' },
      { title: '일상', desc: '시간과 하루' },
      { title: '쇼핑', desc: '多少钱?' },
      { title: '여행', desc: '길 묻기' }
    ]
  },
  {
    id: 'es', name: '스페인어', badge: 'ES', color: '#e85d4a', lang: 'es-ES', kind: 'language', langName: '스페인어',
    units: [
      {
        title: '인사하기', desc: '¡Hola!',
        vocab: [['hola', '안녕'], ['adiós', '잘 가'], ['gracias', '고마워요'], ['por favor', '부탁해요'], ['sí', '네'],
          ['no', '아니요'], ['buenos días', '좋은 아침'], ['buenas noches', '잘 자요'], ['amigo', '친구'], ['perdón', '미안해요']],
        sentences: [en('Hola, amigo.', '안녕, 친구야.'), en('Muchas gracias.', '정말 고마워요.'),
          en('Buenos días, mamá.', '좋은 아침이에요, 엄마.'), en('Sí, por favor.', '네, 부탁해요.'), en('Hasta mañana.', '내일 봐요.')]
      },
      { title: '자기소개', desc: 'Me llamo…' },
      { title: '숫자', desc: 'uno, dos, tres' },
      { title: '음식', desc: 'comida' },
      { title: '가족', desc: 'familia' },
      { title: '일상', desc: '하루 일과' },
      { title: '여행', desc: '길 묻기' }
    ]
  },
  {
    id: 'chess', name: '체스', badge: '♞', color: '#8a6cf0', kind: 'chess',
    units: [
      { title: '기물 움직이기', desc: '룩, 비숍, 퀸, 나이트, 킹, 폰' },
      { title: '잡기', desc: '상대 기물을 잡아요' },
      { title: '체크', desc: '킹을 공격해요' },
      { title: '체크메이트', desc: '한 수로 이기기' },
      { title: '체크메이트 2', desc: '조금 더 어려운 한 수' }
    ]
  }
];

export const courseOf = (id) => COURSES.find((c) => c.id === id) || null;
export const lessonKey = (unit, lesson) => `${unit}-${lesson}`;
