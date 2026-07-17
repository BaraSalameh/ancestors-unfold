import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "ar";

type Dict = Record<string, { en: string; ar: string }>;

const dict: Dict = {
  verify_email: { en: "Verify your email", ar: "تحقق من بريدك الإلكتروني" },
  verification_sent: {
    en: "Check your inbox for the six-digit verification code.",
    ar: "تحقق من صندوق الوارد للحصول على رمز التحقق المكون من ستة أرقام.",
  },
  confirm_code: { en: "Confirm code", ar: "تأكيد الرمز" },
  resend_code: { en: "Send another code", ar: "إرسال رمز آخر" },
  send_verification_code: { en: "Send verification code", ar: "إرسال رمز التحقق" },
  email_not_verified: {
    en: "Your account is pending. We sent a new code; check your inbox.",
    ar: "حسابك قيد الانتظار. أرسلنا رمزًا جديدًا؛ تحقق من صندوق الوارد.",
  },
  invalid_or_expired_code: {
    en: "That code is invalid or expired. Request a new one.",
    ar: "هذا الرمز غير صالح أو منتهي الصلاحية. اطلب رمزًا جديدًا.",
  },
  invalid_or_expired_link: {
    en: "This password-reset link is invalid or expired.",
    ar: "رابط إعادة تعيين كلمة المرور غير صالح أو منتهي الصلاحية.",
  },
  resend_too_soon: {
    en: "Please wait one minute before requesting another code.",
    ar: "يرجى الانتظار دقيقة قبل طلب رمز آخر.",
  },
  delivery_failed: {
    en: "We could not send the email. Please try again shortly.",
    ar: "تعذر إرسال البريد الإلكتروني. يرجى المحاولة بعد قليل.",
  },
  reset_password: { en: "Reset password", ar: "إعادة تعيين كلمة المرور" },
  forgot_password_description: {
    en: "Enter your email and we’ll send a secure reset link.",
    ar: "أدخل بريدك الإلكتروني وسنرسل رابطًا آمنًا لإعادة التعيين.",
  },
  send_reset_link: { en: "Send reset link", ar: "إرسال رابط إعادة التعيين" },
  reset_email_sent: {
    en: "If an active account exists, a reset link has been sent.",
    ar: "إذا كان الحساب النشط موجودًا، فقد تم إرسال رابط إعادة التعيين.",
  },
  back_to_login: { en: "Back to login", ar: "العودة إلى تسجيل الدخول" },
  choose_new_password: {
    en: "Choose a new password with at least 12 characters.",
    ar: "اختر كلمة مرور جديدة تتكون من 12 حرفًا على الأقل.",
  },
  password_reset_success: {
    en: "Your password was changed. You can now log in.",
    ar: "تم تغيير كلمة المرور. يمكنك الآن تسجيل الدخول.",
  },
  change_email_description: {
    en: "Changing your email requires your current password and verification of the new address.",
    ar: "يتطلب تغيير البريد الإلكتروني كلمة المرور الحالية والتحقق من العنوان الجديد.",
  },
  new_email: { en: "New email", ar: "البريد الإلكتروني الجديد" },
  current_password: { en: "Current password", ar: "كلمة المرور الحالية" },
  email_changed: { en: "Email address changed", ar: "تم تغيير عنوان البريد الإلكتروني" },
  registration_password_too_short: {
    en: "Password must be at least 12 characters.",
    ar: "يجب أن تتكون كلمة المرور من 12 حرفًا على الأقل.",
  },
  invalid_auth_input: {
    en: "Some account details are invalid. Check the form and try again.",
    ar: "بعض بيانات الحساب غير صالحة. تحقق من النموذج وحاول مرة أخرى.",
  },
  auth_rate_limited: {
    en: "Too many attempts. Please wait a while before trying again.",
    ar: "محاولات كثيرة جدًا. يرجى الانتظار قليلًا قبل المحاولة مرة أخرى.",
  },
  auth_service_unavailable: {
    en: "Account services are temporarily unavailable. Please try again later.",
    ar: "خدمات الحسابات غير متاحة مؤقتًا. حاول مرة أخرى لاحقًا.",
  },
  auth_title: { en: "Welcome to Ancestors Unfold", ar: "مرحبًا بك في أنسابنا" },
  auth_description: {
    en: "Sign in or create an account to manage your family history.",
    ar: "سجّل الدخول أو أنشئ حسابًا لإدارة تاريخ عائلتك.",
  },
  login: { en: "Log in", ar: "تسجيل الدخول" },
  register: { en: "Register", ar: "إنشاء حساب" },
  create_account: { en: "Create account", ar: "إنشاء الحساب" },
  email: { en: "Email", ar: "البريد الإلكتروني" },
  password: { en: "Password", ar: "كلمة المرور" },
  email_required: { en: "Email is required.", ar: "البريد الإلكتروني مطلوب." },
  email_invalid: { en: "Enter a valid email address.", ar: "أدخل عنوان بريد إلكتروني صالحًا." },
  password_required: { en: "Password is required.", ar: "كلمة المرور مطلوبة." },
  password_too_short: {
    en: "Password must be at least 8 characters.",
    ar: "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.",
  },
  email_exists: {
    en: "This email is already registered.",
    ar: "هذا البريد الإلكتروني مسجّل بالفعل.",
  },
  invalid_credentials: {
    en: "The email or password is incorrect.",
    ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  },
  auth_error: {
    en: "Authentication could not be completed. Please try again.",
    ar: "تعذّر إكمال المصادقة. حاول مرة أخرى.",
  },
  user_profile: { en: "User profile", ar: "الملف الشخصي" },
  signed_in_as: { en: "Signed in as", ar: "تم تسجيل الدخول باسم" },
  logout: { en: "Log out", ar: "تسجيل الخروج" },
  email_placeholder: { en: "you@example.com", ar: "you@example.com" },
  password_placeholder: { en: "Enter your password", ar: "أدخل كلمة المرور" },
  confirm_password: { en: "Confirm password", ar: "تأكيد كلمة المرور" },
  confirm_password_placeholder: { en: "Re-enter your password", ar: "أعد إدخال كلمة المرور" },
  confirm_password_required: { en: "Please confirm your password.", ar: "يرجى تأكيد كلمة المرور." },
  passwords_do_not_match: { en: "Passwords do not match.", ar: "كلمتا المرور غير متطابقتين." },
  forgot_password: { en: "Forgot password?", ar: "نسيت كلمة المرور؟" },
  or_continue_with: { en: "Or continue with", ar: "أو المتابعة باستخدام" },
  continue_with_google: { en: "Continue with Google", ar: "المتابعة باستخدام Google" },
  feature_requires_backend: {
    en: "This feature will be available after secure backend setup.",
    ar: "ستتوفر هذه الميزة بعد إعداد الخادم الآمن.",
  },
  profile_settings: { en: "Profile settings", ar: "إعدادات الملف الشخصي" },
  profile_description: {
    en: "Manage your account and security preferences.",
    ar: "إدارة حسابك وتفضيلات الأمان.",
  },
  account_information: { en: "Account information", ar: "معلومات الحساب" },
  account_information_description: {
    en: "Your current account details.",
    ar: "تفاصيل حسابك الحالية.",
  },
  two_factor_authentication: { en: "Two-factor authentication", ar: "المصادقة الثنائية" },
  two_factor_description: {
    en: "Add an authenticator app as an extra layer of protection for your account.",
    ar: "أضف تطبيق مصادقة كطبقة حماية إضافية لحسابك.",
  },
  authenticator_app: { en: "Authenticator app", ar: "تطبيق المصادقة" },
  authenticator_app_description: {
    en: "The future setup will use a QR code, a six-digit verification code, and one-time recovery codes.",
    ar: "سيستخدم الإعداد المستقبلي رمز QR ورمز تحقق من ستة أرقام ورموز استرداد تستخدم مرة واحدة.",
  },
  enable_authenticator: { en: "Enable authenticator app", ar: "تفعيل تطبيق المصادقة" },
  not_enabled: { en: "Not enabled", ar: "غير مفعّلة" },
  full_name_en: { en: "Full name (English)", ar: "الاسم الكامل (بالإنجليزية)" },
  full_name_ar: { en: "Full name (Arabic)", ar: "الاسم الكامل (بالعربية)" },
  full_name_en_placeholder: {
    en: "Enter your full name in English",
    ar: "أدخل اسمك الكامل بالإنجليزية",
  },
  full_name_ar_placeholder: {
    en: "Enter your full name in Arabic",
    ar: "أدخل اسمك الكامل بالعربية",
  },
  full_name_en_required: {
    en: "Full name in English is required.",
    ar: "الاسم الكامل بالإنجليزية مطلوب.",
  },
  full_name_ar_required: {
    en: "Full name in Arabic is required.",
    ar: "الاسم الكامل بالعربية مطلوب.",
  },
  dashboard: { en: "Dashboard", ar: "لوحة التحكم" },
  family_archive: { en: "Your family archive", ar: "أرشيف عائلتك" },
  welcome_back_adam: { en: "Welcome back, Adam", ar: "مرحباً بك مجدداً، آدم" },
  dashboard_intro: {
    en: "Continue documenting the people and stories that shaped your family.",
    ar: "واصل توثيق الأشخاص والقصص التي شكّلت تاريخ عائلتك.",
  },
  create_family_tree: { en: "Create family tree", ar: "إنشاء شجرة عائلة" },
  family_trees: { en: "Family trees", ar: "أشجار العائلة" },
  across_account: { en: "Across your account", ar: "في حسابك" },
  people_recorded: { en: "People recorded", ar: "الأشخاص المسجلون" },
  in_all_trees: { en: "In all family trees", ar: "في جميع أشجار العائلة" },
  latest_activity: { en: "Latest activity", ar: "آخر نشاط" },
  today: { en: "Today", ar: "اليوم" },
  family_updated: { en: "Al-Rashid Family updated", ar: "تم تحديث عائلة الراشد" },
  your_family_trees: { en: "Your family trees", ar: "أشجار عائلتك" },
  manage_family_history: {
    en: "Preview, edit and manage your family history.",
    ar: "عاين تاريخ عائلتك وعدّله وأدِره.",
  },
  search_family_trees: { en: "Search family trees...", ar: "ابحث في أشجار العائلة..." },
  rename_update: { en: "Rename & update", ar: "إعادة التسمية والتحديث" },
  members_count: { en: "members", ar: "أفراد" },
  generations_count: { en: "generations", ar: "أجيال" },
  preview: { en: "Preview", ar: "معاينة" },
  no_trees_found: { en: "No family trees found", ar: "لم يتم العثور على أشجار عائلة" },
  no_trees_hint: {
    en: "Try another search or create a new tree.",
    ar: "جرّب بحثاً آخر أو أنشئ شجرة جديدة.",
  },
  update_family_tree: { en: "Update family tree", ar: "تحديث شجرة العائلة" },
  update_tree_desc: {
    en: "Change how this tree appears on your dashboard.",
    ar: "غيّر طريقة ظهور هذه الشجرة في لوحة التحكم.",
  },
  create_tree_title: { en: "Create a family tree", ar: "إنشاء شجرة عائلة" },
  create_tree_desc: {
    en: "Give your new family archive a name to get started.",
    ar: "امنح أرشيف عائلتك الجديد اسماً للبدء.",
  },
  family_name: { en: "Family name", ar: "اسم العائلة" },
  family_name_en: { en: "Family name (English)", ar: "اسم العائلة (بالإنجليزية)" },
  family_name_ar: { en: "Family name (Arabic)", ar: "اسم العائلة (بالعربية)" },
  description_en: { en: "Description (English)", ar: "الوصف (بالإنجليزية)" },
  description_ar: { en: "Description (Arabic)", ar: "الوصف (بالعربية)" },
  family_name_example: { en: "e.g. The Williams Family", ar: "مثال: عائلة ويليامز" },
  description: { en: "Description", ar: "الوصف" },
  optional: { en: "(optional)", ar: "(اختياري)" },
  tree_note_placeholder: { en: "A short note about this tree", ar: "ملاحظة قصيرة عن هذه الشجرة" },
  save_changes: { en: "Save changes", ar: "حفظ التغييرات" },
  create_tree: { en: "Create tree", ar: "إنشاء الشجرة" },
  delete_tree_title: { en: "Delete family tree?", ar: "حذف شجرة العائلة؟" },
  delete_tree_desc: {
    en: "This removes the family tree from your dashboard. This action cannot be undone.",
    ar: "سيؤدي هذا إلى إزالة شجرة العائلة من لوحة التحكم. لا يمكن التراجع عن هذا الإجراء.",
  },
  delete_family_tree: { en: "Delete family tree", ar: "حذف شجرة العائلة" },
  new_family_story: {
    en: "A new family story waiting to unfold.",
    ar: "قصة عائلية جديدة تنتظر أن تُروى.",
  },
  just_now: { en: "Just now", ar: "الآن" },
  app_name: { en: "Family Tree Hub", ar: "شجرة العائلة" },
  family_tree: { en: "Family Tree", ar: "شجرة العائلة" },
  settings: { en: "Settings", ar: "الإعدادات" },
  add_member: { en: "Add Member", ar: "إضافة فرد" },
  edit_member: { en: "Edit Member", ar: "تعديل الفرد" },
  member_details: { en: "Member Details", ar: "تفاصيل الفرد" },
  search_placeholder: { en: "Search by name…", ar: "ابحث بالاسم…" },
  language: { en: "Language", ar: "اللغة" },
  theme: { en: "Theme", ar: "المظهر" },
  light: { en: "Light", ar: "فاتح" },
  dark: { en: "Dark", ar: "داكن" },
  english: { en: "English", ar: "الإنجليزية" },
  arabic: { en: "Arabic", ar: "العربية" },
  name_en: { en: "Name (English)", ar: "الاسم (إنجليزي)" },
  name_ar: { en: "Name (Arabic)", ar: "الاسم (عربي)" },
  gender: { en: "Gender", ar: "الجنس" },
  male: { en: "Male", ar: "ذكر" },
  female: { en: "Female", ar: "أنثى" },
  birth_date: { en: "Date of Birth", ar: "تاريخ الميلاد" },
  death_date: { en: "Date of Death", ar: "تاريخ الوفاة" },
  citizen_status: { en: "Citizen status", ar: "حالة الإقامة" },
  resident: { en: "Resident", ar: "مقيم" },
  non_resident: { en: "Non-resident", ar: "غير مقيم" },
  image_url: { en: "Profile Image URL", ar: "رابط الصورة" },
  notes: { en: "Biography / Notes", ar: "نبذة / ملاحظات" },
  father: { en: "Father", ar: "الأب" },
  mother: { en: "Mother", ar: "الأم" },
  spouse: { en: "Spouse", ar: "الزوج/الزوجة" },
  children: { en: "Children", ar: "الأبناء" },
  generation: { en: "Generation", ar: "الجيل" },
  all_generations: { en: "All generations", ar: "كل الأجيال" },
  go: { en: "Go", ar: "انتقال" },
  preview_type: { en: "Preview type", ar: "نوع العرض" },
  lineage_view: { en: "Family levels", ar: "مستويات العائلة" },
  generation_view: { en: "By decade", ar: "حسب العقد" },
  collapse_descendants: { en: "Hide descendants", ar: "إخفاء الذرية" },
  expand_descendants: { en: "Show descendants", ar: "إظهار الذرية" },
  status: { en: "Status", ar: "الحالة" },
  living: { en: "Living", ar: "على قيد الحياة" },
  deceased: { en: "Deceased", ar: "متوفى" },
  save: { en: "Save", ar: "حفظ" },
  cancel: { en: "Cancel", ar: "إلغاء" },
  delete: { en: "Delete", ar: "حذف" },
  edit: { en: "Edit", ar: "تعديل" },
  back: { en: "Back", ar: "رجوع" },
  add_child: { en: "Add Child", ar: "إضافة ابن/ابنة" },
  add_parent: { en: "Add Parent", ar: "إضافة والد" },
  add_spouse: { en: "Add Spouse", ar: "إضافة زوج" },
  none: { en: "None", ar: "لا يوجد" },
  no_father: { en: "— None —", ar: "— لا يوجد —" },
  ancestors: { en: "Ancestors", ar: "الأجداد" },
  descendants: { en: "Descendants", ar: "الأحفاد" },
  confirm_delete: { en: "Delete this family member?", ar: "حذف هذا الفرد؟" },
  confirm_delete_desc: {
    en: "This action cannot be undone. Connected relatives will be unlinked.",
    ar: "لا يمكن التراجع. سيتم فصل الأقارب المرتبطين.",
  },
  delete_warning_children: {
    en: "This member has children. Deleting will unlink them but keep their records.",
    ar: "لهذا الفرد أبناء. الحذف سيفصلهم لكن يبقي سجلاتهم.",
  },
  created: { en: "Member added", ar: "تمت الإضافة" },
  updated: { en: "Member updated", ar: "تم التحديث" },
  deleted: { en: "Member deleted", ar: "تم الحذف" },
  reset_data: { en: "Reset to sample data", ar: "إعادة البيانات الأولية" },
  data_reset: { en: "Data reset", ar: "تمت إعادة الضبط" },
  name_required: {
    en: "At least one name (English or Arabic) is required",
    ar: "يلزم إدخال الاسم بالإنجليزية أو العربية",
  },
  gender_required: { en: "Gender is required", ar: "الجنس مطلوب" },
  zoom_in: { en: "Zoom in", ar: "تكبير" },
  zoom_out: { en: "Zoom out", ar: "تصغير" },
  fit_view: { en: "Fit view", ar: "ملاءمة العرض" },
  no_results: { en: "No matching members", ar: "لا توجد نتائج" },
  basic_info: { en: "Basic Information", ar: "المعلومات الأساسية" },
  not_found: { en: "Member not found", ar: "الفرد غير موجود" },
  parent_label: { en: "Parent", ar: "والد" },
  father_label: { en: "Father", ar: "الأب" },
  mother_label: { en: "Mother", ar: "الأم" },
  link_updated: { en: "Relationship updated", ar: "تم تحديث العلاقة" },
  link_removed: { en: "Relationship removed", ar: "تم إزالة العلاقة" },
  cannot_link_self: {
    en: "A member cannot be their own parent",
    ar: "لا يمكن أن يكون الفرد والد نفسه",
  },
  cannot_link_cycle: {
    en: "This would create a cycle in the tree",
    ar: "سيؤدي هذا إلى حلقة في الشجرة",
  },
  connect_hint: {
    en: "Drag between dots to link. Drag cards to move. Click a connector to delete or drag its endpoint to reconnect.",
    ar: "اسحب بين النقاط للربط. اسحب البطاقات للتحريك. انقر على الرابط لحذفه أو اسحب طرفه لإعادة توصيله.",
  },
  auto_layout: { en: "Auto layout", ar: "ترتيب تلقائي" },
  auto_layout_done: { en: "Layout rearranged", ar: "تمت إعادة الترتيب" },
  undo: { en: "Undo", ar: "تراجع" },
  redo: { en: "Redo", ar: "إعادة" },
  divorced: { en: "Divorced", ar: "مطلقة" },
  mark_divorced: { en: "Mark as divorced", ar: "وضع علامة مطلقة" },
  mark_married: { en: "Mark as married", ar: "وضع علامة متزوجة" },
  select_mother: { en: "Select the mother", ar: "اختر الأم" },
  select_mother_desc: {
    en: "This father has more than one wife. Choose which wife is the child's mother.",
    ar: "لهذا الأب أكثر من زوجة. اختر أيّ زوجة هي أم الطفل.",
  },
  unknown_mother: { en: "Unknown / skip", ar: "غير معروفة / تخطٍ" },
  spouses: { en: "Spouses", ar: "الزوجات" },
  edit_spouses: { en: "Edit spouses", ar: "تعديل الزوجات" },
  no_spouses_recorded: { en: "No spouses recorded yet", ar: "لم يتم تسجيل زوجات بعد" },
  add_spouse_existing: { en: "Link an existing woman", ar: "ربط امرأة موجودة" },
  add_spouse_unknown: { en: "Add unknown spouse", ar: "إضافة زوجة غير معروفة" },
  search_spouse: { en: "Search by name…", ar: "ابحث بالاسم…" },
  move_spouse_up: { en: "Move spouse up", ar: "نقل الزوجة لأعلى" },
  move_spouse_down: { en: "Move spouse down", ar: "نقل الزوجة لأسفل" },
  unknown_wife: { en: "Unknown", ar: "غير معروفة" },
  already_wife: { en: "Already linked", ar: "مرتبطة مسبقًا" },
  remove_wife: { en: "Remove", ar: "إزالة" },
  external_children: { en: "Children from another family", ar: "أبناء من أسرة أخرى" },
  external_children_desc: {
    en: "Children this woman had with a previous husband outside this tree.",
    ar: "أبناء أنجبتهم هذه المرأة من زوج سابق من خارج هذه الشجرة.",
  },
  child_name: { en: "Child name", ar: "اسم الابن/الابنة" },
  other_parent: { en: "Other parent (outside)", ar: "الوالد الآخر (خارجي)" },
  has_external_children: { en: "Has children from another family", ar: "لديها أبناء من أسرة أخرى" },
  add_row: { en: "Add", ar: "إضافة" },
  remove: { en: "Remove", ar: "إزالة" },
  subfamily: { en: "Sub-family", ar: "العائلة الجزئية" },
  subfamilies: { en: "Sub-families", ar: "العائلات الجزئية" },
  subfamilies_nav: { en: "Sub-families", ar: "العائلات الجزئية" },
  add_subfamily: { en: "Add sub-family label", ar: "إضافة تسمية العائلة الجزئية" },
  subfamily_name: { en: "Sub-family name", ar: "اسم العائلة الجزئية" },
  linked_male: { en: "Family root", ar: "جذر العائلة" },
  search_male: { en: "Search male by name", ar: "ابحث عن الرجل بالاسم" },
  select_linked_male: { en: "Select linked male later", ar: "اختر الرجل المرتبط لاحقًا" },
  subfamily_members: { en: "Members", ar: "الأعضاء" },
  subfamily_males: { en: "Males", ar: "الذكور" },
  subfamily_females: { en: "Females", ar: "الإناث" },
  subfamily_total: { en: "Total", ar: "الإجمالي" },
  subfamily_living: { en: "Living", ar: "الأحياء" },
  subfamily_living_males: { en: "Living males", ar: "الذكور الأحياء" },
  subfamily_living_females: { en: "Living females", ar: "الإناث الأحياء" },
  show_related_tree: { en: "Show only related tree", ar: "عرض شجرة الفرع فقط" },
  attachment_name: { en: "Attachment name", ar: "اسم المرفق" },
  attachment_type: { en: "Type", ar: "النوع" },
  attachment_url: { en: "Link / URL", ar: "الرابط" },
  add_attachment: { en: "Add attachment", ar: "إضافة مرفق" },
  no_attachments: { en: "No attachments yet", ar: "لا توجد مرفقات بعد" },
  view_subfamily: { en: "View sub-family", ar: "عرض العائلة الجزئية" },
};

export function ordinal(n: number, lang: Lang): string {
  if (lang === "ar") {
    const arabic = [
      "الأولى",
      "الثانية",
      "الثالثة",
      "الرابعة",
      "الخامسة",
      "السادسة",
      "السابعة",
      "الثامنة",
    ];
    return arabic[n - 1] ?? `${n}`;
  }
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: keyof typeof dict) => string;
  dir: "ltr" | "rtl";
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = (typeof window !== "undefined" &&
      window.localStorage.getItem("ft:lang")) as Lang | null;
    if (saved === "en" || saved === "ar") setLangState(saved);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem("ft:lang", l);
  };

  const t = (k: keyof typeof dict) => dict[k]?.[lang] ?? String(k);
  const dir = lang === "ar" ? "rtl" : "ltr";

  return <Ctx.Provider value={{ lang, setLang, t, dir }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}

export function displayName(m: { name_en: string; name_ar: string }, lang: Lang) {
  if (lang === "ar") return m.name_ar || m.name_en;
  return m.name_en || m.name_ar;
}
