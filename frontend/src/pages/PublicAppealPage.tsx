import React, { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  TextField,
  MenuItem,
  Checkbox,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  Alert,
  CircularProgress,
  Divider,
  Modal,
  Fade,
  RadioGroup,
  FormControlLabel as FCL,
  Radio,
  FormHelperText,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import {
  Close as CloseIcon,
  CloudUpload as CloudUploadIcon,
  InsertDriveFile as FileIcon,
  DeleteOutlined as DeleteIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import Footer from '../components/Layout/Footer';
import { getAppealTargets, submitPublicAppeal, AppealTarget, AppealKind, AppealApplicantType } from '../api/edoApi';

const MAX_FILES = 10;
const MAX_TOTAL_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXT = ['.doc', '.docx', '.xls', '.xlsx', '.pdf', '.jpeg', '.jpg', '.png'];
const MAX_CONTENT = 4000;

const KIND_LABELS: Record<AppealKind, string> = {
  complaint: 'Жалоба',
  application: 'Заявление',
  suggestion: 'Предложение',
};

// ===== СТИЛИ =====
const PageWrapper = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
});

const Background = styled(Box)({
  flex: '1 0 auto',
  padding: '40px 20px',
  background: 'linear-gradient(90deg, #0c71ca, #64bce2)',
});

const Container = styled(Paper)({
  maxWidth: '860px',
  margin: '0 auto',
  borderRadius: '16px',
  padding: '40px 44px',
  boxShadow: '0 4px 6px -2px rgba(41,41,64,.04), 0 10px 15px -3px rgba(41,41,64,.08)',
});

const SectionTitle = styled(Typography)({
  fontFamily: 'Lato, sans-serif',
  fontWeight: 700,
  fontSize: '18px',
  color: '#101025',
  marginBottom: '16px',
});

const HintText = styled(Typography)({
  fontFamily: 'Lato, sans-serif',
  fontSize: '13px',
  color: '#87879b',
  lineHeight: 1.5,
});

const StyledField = styled(TextField)({
  '& .MuiOutlinedInput-root': { borderRadius: '8px', backgroundColor: '#fafafa' },
  '& .MuiInputLabel-root': { fontFamily: 'Lato, sans-serif' },
});

const DropZone = styled(Box)({
  border: '2px dashed #d6d6df',
  borderRadius: '12px',
  padding: '24px 20px',
  textAlign: 'center',
  cursor: 'pointer',
  backgroundColor: '#fafafa',
  transition: 'all .2s ease',
  '&:hover': { borderColor: '#4c6ef5', backgroundColor: '#f9fafe' },
});

interface PickedFile {
  name: string;
  size: number;
  file: File;
}

const formatSize = (bytes: number): string =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;

// ===== ТЕКСТ МОДАЛКИ «ИНФОРМАЦИЯ» =====
const APPEAL_INFO_TEXT = `Условия обработки персональных данных в МРОО «Содружество наставников, педагогов молодежи»

Настоящий раздел определяет условия обработки персональных данных заявителей в рамках работы интернет-приёмной Межрегиональной общественной организации «Содружество наставников, педагогов молодежи» и разработан в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных».

1. Правовой статус организации как оператора

Межрегиональная общественная организация «Содружество наставников, педагогов молодежи» (далее – Оператор) является общественным объединением, созданным для реализации общественно значимых целей в сфере образования, наставничества и молодежной политики.

В соответствии с Федеральным законом № 152-ФЗ, Оператор признаётся лицом, самостоятельно организующим и (или) осуществляющим обработку персональных данных, определяющим цели обработки, состав подлежащих обработке персональных данных и совершаемые с ними действия (операции). Некоммерческая организация, работающая с персональными данными учредителей, членов коллегиальных органов, участников проектов, волонтёров, педагогов и молодежи, является полноценным оператором персональных данных и несёт такие же обязанности, как коммерческие структуры или государственные учреждения.

2. Правовые основания обработки

Обработка персональных данных заявителей в интернет-приёмной осуществляется на следующих правовых основаниях:

– Согласие субъекта персональных данных – в соответствии с пунктом 1 части 1 статьи 6 Федерального закона № 152-ФЗ заявитель даёт добровольное, конкретное, информированное и однозначное согласие на обработку своих персональных данных путём отправки обращения через интернет-приёмную.

– Законные цели общественного объединения – в соответствии с пунктом 3 части 2 статьи 22 Федерального закона № 152-ФЗ, оператор вправе осуществлять обработку персональных данных членов (участников) общественного объединения без уведомления Роскомнадзора для достижения законных целей, предусмотренных учредительными документами, при условии, что персональные данные не будут распространяться или раскрываться третьим лицам без согласия субъектов.

3. Согласие на обработку персональных данных

С 1 сентября 2025 года согласие на обработку персональных данных должно оформляться отдельным документом, не объединённым с иной информацией и (или) документами, которые подтверждает или подписывает субъект персональных данных (часть 1 статьи 9 Федерального закона № 152-ФЗ).

Отправляя обращение через настоящую интернет-приёмную, заявитель даёт свое согласие на обработку персональных данных в целях рассмотрения обращения. Для иных целей (например, участие в проектах, волонтёрская деятельность, заключение договоров) Оператор запрашивает отдельное согласие.

4. Перечень обрабатываемых персональных данных

В процессе рассмотрения обращения обрабатываются следующие персональные данные:

– фамилия, имя, отчество (последнее – при наличии);
– адрес электронной почты, по которому должен быть направлен ответ;
– контактный номер телефона (при необходимости);
– полное и краткое наименование организации, ФИО руководителя (при необходимости);
– иные персональные данные, указанные заявителем в тексте обращения, а также ставшие известными в ходе его рассмотрения.

В случае участия в проектах, программах или мероприятиях Оператора могут обрабатываться данные, отнесённые к специальным категориям (сведения о состоянии здоровья, инвалидности и др.), обработка которых требует соблюдения дополнительных условий, предусмотренных статьёй 10 Федерального закона № 152-ФЗ.

5. Операции с персональными данными

С персональными данными заявителей выполняются следующие операции: сбор, запись, систематизация, накопление, хранение, уточнение (обновление, изменение), извлечение, использование, передача (предоставление, доступ), блокирование, удаление, уничтожение.

6. Сроки и условия хранения

Обработка персональных данных осуществляется в течение срока, необходимого для рассмотрения обращения и исполнения требований законодательства. По истечении установленных сроков хранения персональные данные подлежат уничтожению или обезличиванию.

7. Обеспечение безопасности

Оператор принимает необходимые организационные и технические меры для защиты персональных данных от неправомерного или случайного доступа, уничтожения, изменения, блокирования, копирования, распространения, а также от иных неправомерных действий.

8. Права субъекта персональных данных

Заявитель как субъект персональных данных имеет право на:

– получение информации об обработке его персональных данных;
– уточнение, блокирование или уничтожение данных в случае, если они являются неполными, устаревшими, недостоверными, незаконно полученными или не являются необходимыми для заявленной цели обработки;
– отзыв согласия на обработку персональных данных (в случаях, когда обработка осуществляется на основании согласия) путём направления письменного заявления Оператору по адресу электронной почты: info@mroo-snpm.ru;
– требование о прекращении распространения персональных данных в течение трёх рабочих дней с момента получения требования.

9. Особенности обработки данных несовершеннолетних

Организация осуществляет деятельность по наставничеству, работе с молодёжью и педагогами, в связи с чем может обрабатывать персональные данные несовершеннолетних лиц. Согласие на обработку персональных данных несовершеннолетних участников проектов и мероприятий предоставляется их законными представителями (родителями, усыновителями, опекунами) в порядке, установленном законодательством.

10. Информация об Операторе

Полное наименование: Межрегиональная общественная организация «Содружество наставников, педагогов молодежи»

Место нахождения: Кабардино-Балкарская Республика, г. Нальчик, ул. Московская, зд 2

Адрес электронной почты: info@mroo-snpm.ru

Телефон: +7 (989) 647-77-15

Порядок подачи и рассмотрения обращений

1. Обращение может быть подано физическим лицом или организацией через настоящую интернет-приёмную.

2. Обязательные для заполнения поля отмечены знаком *. К обращению могут быть приложены до 10 файлов общим объёмом не более 10 Мбайт в форматах: doc, docx, xls, xlsx, pdf, jpeg, jpg, png.

3. Обращение подлежит обязательной регистрации в течение 3 дней с момента поступления.

4. Обращение рассматривается в течение 30 дней со дня его регистрации. В указанный срок включается подготовка и направление письменного ответа заявителю.

5. Ответ на обращение, уведомления о его статусах либо о переадресации направляются в форме электронного документа по адресу электронной почты, указанному в обращении.

6. В случае если решение вопросов, изложенных в обращении, не относится к компетенции Межрегиональной общественной организации «Содружество наставников, педагогов молодежи», обращение может быть перенаправлено в уполномоченную организацию. Заявитель уведомляется о переадресации по электронной почте.

7. Обращения, в которых не указаны фамилия заявителя или адрес электронной почты, по которому должен быть направлен ответ, а также обращения, содержащие нецензурную лексику, оскорбления, угрозы, могут быть оставлены без рассмотрения по существу.

8. Отправляя обращение, заявитель подтверждает достоверность указанных данных и даёт согласие на их обработку в целях рассмотрения обращения.`;

// ===== КОМПОНЕНТ =====
const PublicAppealPage: React.FC = () => {
  const [targets, setTargets] = useState<AppealTarget[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [infoOpen, setInfoOpen] = useState(false);

  // Успешная отправка
  const [result, setResult] = useState<{ system_number: string; register_deadline?: string } | null>(null);

  // Форма
  const [consent, setConsent] = useState(false);
  const [pdConsent, setPdConsent] = useState(false);
  const [targetOrgId, setTargetOrgId] = useState<number | ''>('');
  const [kind, setKind] = useState<AppealKind | ''>('');
  const [content, setContent] = useState('');
  const [applicantType, setApplicantType] = useState<AppealApplicantType>('citizen');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [email, setEmail] = useState('');
  const [emailConfirm, setEmailConfirm] = useState('');
  const [phone, setPhone] = useState('');
  const [orgFullName, setOrgFullName] = useState('');
  const [orgShortName, setOrgShortName] = useState('');
  const [orgDirector, setOrgDirector] = useState('');
  const [pickedFiles, setPickedFiles] = useState<PickedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAppealTargets()
      .then(setTargets)
      .catch(() => setFormError('Не удалось загрузить список организаций'))
      .finally(() => setLoadingTargets(false));
  }, []);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFieldErrors(prev => ({ ...prev, files: '' }));
    const next: PickedFile[] = [...pickedFiles];
    let total = pickedFiles.reduce((s, f) => s + f.size, 0);
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        setFieldErrors(prev => ({ ...prev, files: `Допустимо не более ${MAX_FILES} файлов` }));
        break;
      }
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) {
        setFieldErrors(prev => ({
          ...prev,
          files: `Недопустимый формат «${f.name}». Разрешены: doc, docx, xls, xlsx, pdf, jpeg, jpg, png`,
        }));
        continue;
      }
      total += f.size;
      if (total > MAX_TOTAL_SIZE) {
        setFieldErrors(prev => ({ ...prev, files: 'Суммарный объём файлов превышает 10 МБ' }));
        break;
      }
      next.push({ name: f.name, size: f.size, file: f });
    }
    setPickedFiles(next);
  };

  const removeFile = (idx: number) => {
    setPickedFiles(prev => prev.filter((_, i) => i !== idx));
    setFieldErrors(prev => ({ ...prev, files: '' }));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!consent) e.consent = 'Необходимо подтвердить ознакомление с информацией';
    if (!pdConsent) e.pdConsent = 'Необходимо дать согласие на обработку персональных данных';
    if (!targetOrgId) e.targetOrgId = 'Выберите адресата';
    if (!kind) e.kind = 'Выберите вид обращения';
    if (!content.trim()) e.content = 'Введите содержание обращения';
    else if (content.length > MAX_CONTENT) e.content = `Максимум ${MAX_CONTENT} символов`;
    if (!lastName.trim()) e.lastName = 'Укажите фамилию';
    if (!firstName.trim()) e.firstName = 'Укажите имя';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Введите корректный адрес электронной почты';
    else if (email.trim().toLowerCase() !== emailConfirm.trim().toLowerCase())
      e.emailConfirm = 'Адреса электронной почты не совпадают';
    if (applicantType === 'organization' && !orgFullName.trim())
      e.orgFullName = 'Укажите полное наименование организации';
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!validate()) return;

    const fd = new FormData();
    fd.append('target_org_id', String(targetOrgId));
    fd.append('kind', kind);
    fd.append('content', content.trim());
    fd.append('applicant_type', applicantType);
    fd.append('last_name', lastName.trim());
    fd.append('first_name', firstName.trim());
    fd.append('middle_name', middleName.trim());
    fd.append('email', email.trim());
    fd.append('email_confirm', emailConfirm.trim());
    fd.append('phone', phone.trim());
    fd.append('consent', 'true');
    fd.append('pd_consent', pdConsent ? 'true' : 'false');
    fd.append('website', ''); // honeypot
    if (applicantType === 'organization') {
      fd.append('org_full_name', orgFullName.trim());
      fd.append('org_short_name', orgShortName.trim());
      fd.append('org_director', orgDirector.trim());
    }
    pickedFiles.forEach(f => fd.append('files', f.file));

    setSubmitting(true);
    try {
      const res = await submitPublicAppeal(fd);
      setResult({ system_number: res.system_number, register_deadline: res.register_deadline });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail && typeof detail === 'object' && detail.fields) {
        setFieldErrors(detail.fields);
        setFormError(typeof detail === 'string' ? detail : 'Проверьте заполнение формы');
      } else {
        setFormError(
          typeof detail === 'string'
            ? detail
            : err?.response?.status === 429
              ? 'Слишком много обращений с вашего адреса. Попробуйте позже.'
              : 'Не удалось отправить обращение. Попробуйте позже.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setResult(null);
    setConsent(false);
    setPdConsent(false);
    setTargetOrgId('');
    setKind('');
    setContent('');
    setApplicantType('citizen');
    setLastName(''); setFirstName(''); setMiddleName('');
    setEmail(''); setEmailConfirm(''); setPhone('');
    setOrgFullName(''); setOrgShortName(''); setOrgDirector('');
    setPickedFiles([]);
    setFieldErrors({});
    setFormError(null);
  };

  // ===== ЭКРАН УСПЕХА =====
  if (result) {
    return (
      <PageWrapper>
        <Background>
          <Container>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CheckCircleIcon sx={{ fontSize: 72, color: '#4caf50', mb: 2 }} />
              <Typography sx={{ fontFamily: 'Lato', fontWeight: 700, fontSize: 24, color: '#101025', mb: 1 }}>
                Обращение отправлено
              </Typography>
              <Typography sx={{ fontFamily: 'Lato', fontSize: 15, color: '#5a5a72', mb: 1 }}>
                Системный номер обращения:{' '}
                <strong style={{ color: '#101025', fontSize: 18 }}>{result.system_number}</strong>
              </Typography>
              {result.register_deadline && (
                <Typography sx={{ fontFamily: 'Lato', fontSize: 14, color: '#87879b', mb: 3 }}>
                  Срок регистрации — до {result.register_deadline}.
                  Ответ будет направлен на адрес <strong>{email}</strong>.
                </Typography>
              )}
              <HintText sx={{ maxWidth: 520, mx: 'auto', mb: 3 }}>
                Сохраните номер обращения — по нему вы сможете узнать статус,
                указав адрес электронной почты, на который подавалось обращение.
              </HintText>
              <Button
                variant="contained"
                onClick={resetForm}
                sx={{ borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato', fontWeight: 600 }}
              >
                Подать новое обращение
              </Button>
            </Box>
          </Container>
        </Background>
        <Footer />
      </PageWrapper>
    );
  }

  // ===== ФОРМА =====
  return (
    <PageWrapper>
      <Background>
        <Container>
          {/* Заголовок */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography sx={{ fontFamily: 'Lato', fontWeight: 700, fontSize: 26, color: '#101025' }}>
              Интернет-приёмная
            </Typography>
            <Typography sx={{ fontFamily: 'Lato', fontSize: 14, color: '#87879b', mt: 0.5 }}>
              Подача обращения в Единой цифровой платформе обратной связи
            </Typography>
          </Box>

          {formError && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: '12px', fontFamily: 'Lato' }} onClose={() => setFormError(null)}>
              {formError}
            </Alert>
          )}

          {/* Информация + согласие */}
          <Box sx={{ mb: 4 }}>
            <Typography
              component="button"
              onClick={() => setInfoOpen(true)}
              sx={{
                background: 'none', border: 'none', p: 0, cursor: 'pointer',
                fontFamily: 'Lato', fontSize: 14, fontWeight: 600, color: '#4c6ef5',
                textDecoration: 'underline', '&:hover': { color: '#364fc7' },
              }}
            >
              Необходимо ознакомиться с Информацией о подаче и рассмотрении обращений и условиях обработки персональных данных
            </Typography>
            <FormControlLabel
              sx={{ display: 'flex', alignItems: 'flex-start', mt: 1.5, ml: 0 }}
              control={
                <Checkbox
                  checked={consent}
                  onChange={e => { setConsent(e.target.checked); setFieldErrors(p => ({ ...p, consent: '' })); }}
                  sx={{ color: '#4c6ef5', pt: 0.25 }}
                />
              }
              label={
                <Typography sx={{ fontFamily: 'Lato', fontSize: 14, color: '#101025' }}>
                  Подтверждаю ознакомление с информацией о подаче и рассмотрении обращений и условиях обработки персональных данных *
                </Typography>
              }
            />
            {fieldErrors.consent && (
              <FormHelperText error sx={{ ml: 4.5 }}>{fieldErrors.consent}</FormHelperText>
            )}
            <FormControlLabel
              sx={{ display: 'flex', alignItems: 'flex-start', mt: 1.5, ml: 0 }}
              control={
                <Checkbox
                  checked={pdConsent}
                  onChange={e => { setPdConsent(e.target.checked); setFieldErrors(p => ({ ...p, pdConsent: '' })); }}
                  sx={{ color: '#4c6ef5', pt: 0.25 }}
                />
              }
              label={
                <Typography sx={{ fontFamily: 'Lato', fontSize: 14, color: '#101025' }}>
                  Согласен (согласна) с обработкой персональных данных *
                </Typography>
              }
            />
            {fieldErrors.pdConsent && (
              <FormHelperText error sx={{ ml: 4.5 }}>{fieldErrors.pdConsent}</FormHelperText>
            )}
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Адресат */}
          <SectionTitle>Адресат</SectionTitle>
          <FormControl fullWidth size="small" error={!!fieldErrors.targetOrgId}>
            <InputLabel>Адресат *</InputLabel>
            <Select
              value={targetOrgId}
              label="Адресат *"
              onChange={e => { setTargetOrgId(Number(e.target.value)); setFieldErrors(p => ({ ...p, targetOrgId: '' })); }}
              disabled={loadingTargets}
              sx={{ borderRadius: '8px', fontFamily: 'Lato' }}
            >
              {(targets || []).map(t => (
                <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
              ))}
            </Select>
            {fieldErrors.targetOrgId ? (
              <FormHelperText>{fieldErrors.targetOrgId}</FormHelperText>
            ) : (
              <FormHelperText>
                Выберите, куда Вы хотите обратиться (из действующих организаций в системе).
                Если Вы затрудняетесь с выбором, выберите «Содружество наставников, педагогов и молодежи».
              </FormHelperText>
            )}
          </FormControl>

          <Divider sx={{ my: 3 }} />

          {/* Обращение */}
          <SectionTitle>Обращение</SectionTitle>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth size="small" error={!!fieldErrors.kind}>
              <InputLabel>Вид обращения *</InputLabel>
              <Select
                value={kind}
                label="Вид обращения *"
                onChange={e => { setKind(e.target.value as AppealKind); setFieldErrors(p => ({ ...p, kind: '' })); }}
                sx={{ borderRadius: '8px', fontFamily: 'Lato' }}
              >
                {(Object.keys(KIND_LABELS) as AppealKind[]).map(k => (
                  <MenuItem key={k} value={k}>{KIND_LABELS[k]}</MenuItem>
                ))}
              </Select>
              {fieldErrors.kind && <FormHelperText>{fieldErrors.kind}</FormHelperText>}
            </FormControl>

            <StyledField
              fullWidth
              multiline
              rows={7}
              label="Содержание обращения *"
              value={content}
              onChange={e => { setContent(e.target.value.slice(0, MAX_CONTENT)); setFieldErrors(p => ({ ...p, content: '' })); }}
              error={!!fieldErrors.content}
              helperText={fieldErrors.content}
              slotProps={{ htmlInput: { maxLength: MAX_CONTENT } }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mt: -1 }}>
              <HintText sx={{ maxWidth: 620 }}>
                Поле текста обращения имеет техническое ограничение в 4000 символов (с пробелами).
                Если размер Вашего обращения превышает указанное ограничение, прикрепите его в виде отдельного файла,
                а в текстовом поле кратко укажите суть обращения.
              </HintText>
              <HintText sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{content.length}/{MAX_CONTENT}</HintText>
            </Box>

            {/* Приложения */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              accept=".doc,.docx,.xls,.xlsx,.pdf,.jpeg,.jpg,.png"
              onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
            />
            <DropZone onClick={() => fileInputRef.current?.click()}>
              <CloudUploadIcon sx={{ fontSize: 36, color: '#b0b3c3', mb: 1 }} />
              <Typography sx={{ fontFamily: 'Lato', fontSize: 14, color: '#5a5a72' }}>
                Нажмите для выбора вложений
              </Typography>
            </DropZone>
            <HintText>
              Максимально допустимое количество вложений — 10 файлов. Суммарный объём — не более 10 Мбайт.
              Допустимые форматы: doc, docx, xls, xlsx, pdf, jpeg, jpg, png.
            </HintText>
            {fieldErrors.files && <FormHelperText error>{fieldErrors.files}</FormHelperText>}
            {pickedFiles.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {pickedFiles.map((f, idx) => (
                  <Box key={`${f.name}-${idx}`} sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5,
                    p: 1, px: 1.5, bgcolor: '#f4f4f8', borderRadius: '8px',
                  }}>
                    <FileIcon sx={{ fontSize: 20, color: '#4c6ef5' }} />
                    <Typography sx={{ fontFamily: 'Lato', fontSize: 13, color: '#101025', flex: 1, wordBreak: 'break-all' }}>
                      {f.name} <span style={{ color: '#87879b' }}>({formatSize(f.size)})</span>
                    </Typography>
                    <IconButton size="small" onClick={() => removeFile(idx)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Личные данные */}
          <SectionTitle>Личные данные</SectionTitle>
          <RadioGroup
            row
            value={applicantType}
            onChange={(_, v) => setApplicantType(v as AppealApplicantType)}
            sx={{ mb: 2.5 }}
          >
            <FCL value="citizen" control={<Radio sx={{ color: '#4c6ef5' }} />} label="Физическое лицо"
              sx={{ '& .MuiFormControlLabel-label': { fontFamily: 'Lato', fontSize: 14 } }} />
            <FCL value="organization" control={<Radio sx={{ color: '#4c6ef5' }} />} label="Организация"
              sx={{ ml: 4, '& .MuiFormControlLabel-label': { fontFamily: 'Lato', fontSize: 14 } }} />
          </RadioGroup>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <StyledField fullWidth label="Фамилия" size="small" required
                value={lastName} onChange={e => { setLastName(e.target.value); setFieldErrors(p => ({ ...p, lastName: '' })); }}
                error={!!fieldErrors.lastName} helperText={fieldErrors.lastName}
                sx={{ flex: '1 1 180px' }} />
              <StyledField fullWidth label="Имя" size="small" required
                value={firstName} onChange={e => { setFirstName(e.target.value); setFieldErrors(p => ({ ...p, firstName: '' })); }}
                error={!!fieldErrors.firstName} helperText={fieldErrors.firstName}
                sx={{ flex: '1 1 180px' }} />
              <StyledField fullWidth label="Отчество" size="small"
                value={middleName} onChange={e => setMiddleName(e.target.value)}
                sx={{ flex: '1 1 180px' }} />
            </Box>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <StyledField fullWidth label="Адрес электронной почты" size="small" required type="email"
                value={email} onChange={e => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: '', emailConfirm: '' })); }}
                error={!!fieldErrors.email}
                helperText={fieldErrors.email || '⚠ Временно письма на адреса с доменом mail.ru могут не доходить'}
                slotProps={{
                  formHelperText: fieldErrors.email
                    ? undefined
                    : { sx: { color: '#b45309', fontFamily: 'Lato, sans-serif', fontSize: '12px' } },
                }}
                sx={{ flex: '1 1 240px' }} />
              <StyledField fullWidth label="Подтвердите адрес электронной почты" size="small" required type="email"
                value={emailConfirm} onChange={e => { setEmailConfirm(e.target.value); setFieldErrors(p => ({ ...p, emailConfirm: '' })); }}
                error={!!fieldErrors.emailConfirm} helperText={fieldErrors.emailConfirm}
                sx={{ flex: '1 1 240px' }} />
            </Box>
            <HintText>
              Ответ на Ваше обращение, уведомления о его статусах либо уведомление о его переадресации
              будут направлены в форме электронного документа по указанному адресу электронной почты.
              Временно на почту с доменом <strong>mail.ru</strong> письма могут не доходить — при
              возможности укажите адрес на другом домене.
            </HintText>

            <StyledField fullWidth label="Контактный телефон" size="small" placeholder="+7 (___) ___-__-__"
              value={phone} onChange={e => setPhone(e.target.value)} />

            {applicantType === 'organization' && (
              <>
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <StyledField fullWidth label="Полное наименование организации *" size="small" required
                    value={orgFullName} onChange={e => { setOrgFullName(e.target.value); setFieldErrors(p => ({ ...p, orgFullName: '' })); }}
                    error={!!fieldErrors.orgFullName} helperText={fieldErrors.orgFullName}
                    sx={{ flex: '1 1 300px' }} />
                  <StyledField fullWidth label="Краткое наименование организации" size="small"
                    value={orgShortName} onChange={e => setOrgShortName(e.target.value)}
                    sx={{ flex: '1 1 220px' }} />
                </Box>
                <StyledField fullWidth label="ФИО руководителя" size="small"
                  value={orgDirector} onChange={e => setOrgDirector(e.target.value)} />
              </>
            )}
          </Box>

          {/* Отправка */}
          <Divider sx={{ my: 3 }} />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button
              variant="contained"
              size="large"
              disabled={submitting}
              startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : undefined}
              onClick={handleSubmit}
              sx={{
                backgroundColor: '#4c6ef5', borderRadius: '8px', textTransform: 'none',
                fontFamily: 'Lato', fontWeight: 600, px: 4,
                '&:hover': { backgroundColor: '#364fc7' },
              }}
            >
              {submitting ? 'Отправка...' : 'Отправить обращение'}
            </Button>
          </Box>
        </Container>
      </Background>
      <Footer />

      {/* Модалка «Информация о подаче и рассмотрении обращений» */}
      <Modal open={infoOpen} onClose={() => setInfoOpen(false)} closeAfterTransition>
        <Fade in={infoOpen}>
          <Paper sx={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '92%', maxWidth: '720px', maxHeight: '85vh', overflowY: 'auto',
            borderRadius: '16px', p: 4,
          }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
              <Typography sx={{ fontFamily: 'Lato', fontWeight: 700, fontSize: 20, color: '#101025' }}>
                Информация о подаче и рассмотрении обращений и условиях обработки персональных данных
              </Typography>
              <IconButton onClick={() => setInfoOpen(false)} size="small">
                <CloseIcon />
              </IconButton>
            </Box>
            <Typography sx={{
              fontFamily: 'Lato', fontSize: 14, lineHeight: 1.75, color: '#3a3a52',
              whiteSpace: 'pre-line',
            }}>
              {APPEAL_INFO_TEXT}
            </Typography>
            <Box sx={{ mt: 3, textAlign: 'right' }}>
              <Button variant="contained" onClick={() => setInfoOpen(false)}
                sx={{ borderRadius: '8px', textTransform: 'none', fontFamily: 'Lato' }}>
                Ознакомился
              </Button>
            </Box>
          </Paper>
        </Fade>
      </Modal>
    </PageWrapper>
  );
};

export default PublicAppealPage;
