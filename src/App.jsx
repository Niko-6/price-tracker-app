import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';

// Импортируем библиотеку для рендеринга Markdown
import ReactMarkdown from 'react-markdown';
// import remarkGfm from 'remark-gfm'; // Для поддержки таблиц, зачеркнутого текста и т.д. -- временно отключено из-за проблем с компиляцией

// ВНИМАНИЕ: Импорт './index.css' должен быть только в файле main.jsx, а не здесь.
// Если вы видите эту строку в App.jsx, пожалуйста, удалите ее.

function App() {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [products, setProducts] = useState([]);
    const [productName, setProductName] = useState('');
    const [storeName, setStoreName] = useState('');
    const [price, setPrice] = useState('');
    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]); // Default to today's date (YYYY-MM-DD)
    const [quantity, setQuantity] = useState('');
    const [unit, setUnit] = useState('');
    const [category, setCategory] = useState(''); // New state for category
    const [editingProductId, setEditingProductId] = useState(null); // State to track which product is being edited

    const [filterProduct, setFilterProduct] = useState('');
    const [filterStore, setFilterStore] = useState('');
    const [filterCategory, setFilterCategory] = useState(''); // New state for category filter
    const [analysisResult, setAnalysisResult] = useState('');
    const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
    const [message, setMessage] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [productToDelete, setProductToDelete] = useState(null);

    // Authentication states
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Input mode state: 'single' or 'bulk'
    const [inputMode, setInputMode] = useState('single');
    const [bulkInputText, setBulkInputText] = useState('');

    // New states for custom analysis
    const [customAnalysisPrompt, setCustomAnalysisPrompt] = useState('');
    const [customAnalysisResult, setCustomAnalysisResult] = useState('');
    const [isLoadingCustomAnalysis, setIsLoadingCustomAnalysis] = useState(false);

    // Firebase Configuration (REPLACE THESE WITH YOUR ACTUAL FIREBASE CONFIG)
    const firebaseConfig = {
  apiKey: "AIzaSyB0FBsdn8XEV1il35TSidXwS94_dRaoxKQ",
  authDomain: "pricetrackerapp-28d82.firebaseapp.com",
  projectId: "pricetrackerapp-28d82",
  storageBucket: "pricetrackerapp-28d82.firebasestorage.app",
  messagingSenderId: "991111446060",
  appId: "1:991111446060:web:f365131aeca30958175b89",
  measurementId: "G-Y7FKBRTGCX"
};

    const appId = firebaseConfig.projectId; // Using projectId as appId for Firestore paths

    // УНИКАЛЬНЫЙ ИДЕНТИФИКАТОР ДЛЯ ВАШЕЙ СЕМЬИ. ЗАМЕНИТЕ НА СВОЙ!
    const FAMILY_SHARED_LIST_ID = "my-family-prices-2025"; 

    // Initialize Firebase and set up authentication
    useEffect(() => {
        try {
            if (firebaseConfig.apiKey === "YOUR_API_KEY") {
                setMessage("Пожалуйста, замените заглушки конфигурации Firebase на ваши реальные данные.");
                return;
            }

            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const firebaseAuth = getAuth(app);

            setDb(firestore);
            setAuth(firebaseAuth);

            const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
                if (user) {
                    setUserId(user.uid);
                    setMessage(`Пользователь ${user.email} вошел в систему.`);
                } else {
                    setUserId(null);
                    setMessage("Пожалуйста, войдите или зарегистрируйтесь.");
                }
            });

            return () => unsubscribe(); // Cleanup auth listener
        } catch (error) {
            console.error("Ошибка инициализации Firebase:", error);
            setMessage(`Ошибка инициализации приложения: ${error.message}`);
        }
    }, [firebaseConfig]);

    // Fetch products from Firestore when db and userId are available
    useEffect(() => {
        if (!db || !userId) {
            setProducts([]);
            return;
        }

        const productsCollectionRef = collection(db, `artifacts/${appId}/families/${FAMILY_SHARED_LIST_ID}/prices`);

        const q = query(productsCollectionRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedProducts = snapshot.docs.map(doc => {
                const data = doc.data();
                const displayDate = data.date?.toDate().toLocaleDateString('ru-RU') || 'N/A';
                return {
                    id: doc.id,
                    ...data,
                    date: displayDate,
                    originalTimestamp: data.date?.toDate() || new Date(0)
                };
            });
            fetchedProducts.sort((a, b) => b.originalTimestamp.getTime() - a.originalTimestamp.getTime());
            setProducts(fetchedProducts);
        }, (error) => {
            console.error("Ошибка получения данных из Firestore:", error);
            setMessage(`Ошибка загрузки данных: ${error.message}`);
        });

        return () => unsubscribe();
    }, [db, userId, appId, FAMILY_SHARED_LIST_ID]);

    const resetForm = () => {
        setProductName('');
        setStoreName('');
        setPrice('');
        setQuantity('');
        setUnit('');
        setCategory('');
        setPurchaseDate(new Date().toISOString().split('T')[0]);
        setEditingProductId(null);
    };

    const handleAddOrUpdateProduct = async (e) => {
        e.preventDefault();
        if (!productName || !storeName || !price || isNaN(parseFloat(price))) {
            setMessage('Пожалуйста, заполните поля "Название продукта", "Магазин" и "Цена" корректно.');
            return;
        }

        if (!db || !userId) {
            setMessage('База данных не готова или вы не вошли в систему.');
            return;
        }

        try {
            const dateToSave = purchaseDate ? new Date(purchaseDate) : serverTimestamp();
            const productData = {
                productName: productName.trim(),
                storeName: storeName.trim(),
                price: parseFloat(price),
                date: dateToSave,
                quantity: quantity ? parseFloat(quantity) : null,
                unit: unit.trim() || null,
                category: category.trim() || null,
            };

            const targetCollectionRef = collection(db, `artifacts/${appId}/families/${FAMILY_SHARED_LIST_ID}/prices`);

            if (editingProductId) {
                const productRef = doc(db, targetCollectionRef.path, editingProductId);
                await updateDoc(productRef, productData);
                setMessage('Продукт успешно обновлен!');
            } else {
                await addDoc(targetCollectionRef, productData);
                setMessage('Продукт успешно добавлен!');
            }
            resetForm();
        } catch (error) {
            console.error("Ошибка сохранения продукта:", error);
            setMessage(`Ошибка сохранения продукта: ${error.message}`);
        }
    };

    const handleBulkAddProducts = async (e) => {
        e.preventDefault();
        if (!bulkInputText.trim()) {
            setMessage('Пожалуйста, введите данные для массовой загрузки.');
            return;
        }
        if (!db || !userId) {
            setMessage('База данных не готова или или вы не вошли в систему.');
            return;
        }

        const lines = bulkInputText.trim().split('\n');
        const productsToAdd = [];
        let errorCount = 0;

        for (const line of lines) {
            const parts = line.split(',').map(part => part.trim());
            if (parts.length >= 4) {
                const [dateStr, pName, sName, pPriceStr, pQuantityStr, pUnit, pCategory] = parts;
                const parsedPrice = parseFloat(pPriceStr);
                const parsedQuantity = pQuantityStr ? parseFloat(pQuantityStr) : null;
                const parsedDate = new Date(dateStr);

                if (!isNaN(parsedPrice) && !isNaN(parsedDate.getTime())) {
                    productsToAdd.push({
                        productName: pName,
                        storeName: sName,
                        price: parsedPrice,
                        date: parsedDate,
                        quantity: parsedQuantity,
                        unit: pUnit || null,
                        category: pCategory || null,
                    });
                } else {
                    errorCount++;
                    console.warn(`Некорректная строка данных: ${line}`);
                }
            } else {
                errorCount++;
                console.warn(`Недостаточно данных в строке: ${line}`);
            }
        }

        if (productsToAdd.length === 0) {
            setMessage(`Не удалось добавить ни одного продукта. Проверьте формат данных. Ошибок в строках: ${errorCount}`);
            return;
        }

        try {
            const targetCollectionRef = collection(db, `artifacts/${appId}/families/${FAMILY_SHARED_LIST_ID}/prices`);

            const addPromises = productsToAdd.map(product => addDoc(targetCollectionRef, product));
            await Promise.all(addPromises);

            setMessage(`Успешно добавлено ${productsToAdd.length} продуктов. Ошибок в строках: ${errorCount}`);
            setBulkInputText('');
        } catch (error) {
            console.error("Ошибка массового добавления продуктов:", error);
            setMessage(`Ошибка массового добавления продуктов: ${error.message}`);
        }
    };

    const handleEditProduct = (product) => {
        setEditingProductId(product.id);
        setProductName(product.productName);
        setStoreName(product.storeName);
        setPrice(product.price);
        setQuantity(product.quantity || '');
        setUnit(product.unit || '');
        setCategory(product.category || '');
        const [day, month, year] = product.date.split('.');
        setPurchaseDate(`${year}-${month}-${day}`);
        setInputMode('single');
    };

    const handleDeleteClick = (product) => {
        setProductToDelete(product);
        setShowConfirmModal(true);
    };

    const confirmDelete = async () => {
        if (!productToDelete || !db || !userId) {
            setMessage('Ошибка: Не удалось удалить продукт.');
            setShowConfirmModal(false);
            setProductToDelete(null);
            return;
        }
        try {
            const targetCollectionPath = `artifacts/${appId}/families/${FAMILY_SHARED_LIST_ID}/prices`;
            await deleteDoc(doc(db, targetCollectionPath, productToDelete.id));
            setMessage('Продукт успешно удален!');
        } catch (error) {
            console.error("Ошибка удаления продукта:", error);
            setMessage(`Ошибка удаления продукта: ${error.message}`);
        } finally {
            setShowConfirmModal(false);
            setProductToDelete(null);
        }
    };

    const filteredProducts = products.filter(product => {
        const matchesProduct = filterProduct ? product.productName.toLowerCase().includes(filterProduct.toLowerCase()) : true;
        const matchesStore = filterStore ? product.storeName.toLowerCase().includes(filterStore.toLowerCase()) : true;
        const matchesCategory = filterCategory ? product.category?.toLowerCase().includes(filterCategory.toLowerCase()) : true;
        return matchesProduct && matchesStore && matchesCategory;
    });

    const uniqueProductNames = Array.from(new Set(products.map(p => p.productName))).sort();
    const uniqueCategories = Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort();

    const fetchAnalysisFromGemini = async (currentPrompt, setLoading, setResult) => {
        if (!filteredProducts.length) {
            setResult('Нет данных для анализа. Добавьте хотя бы один продукт.');
            return;
        }

        setLoading(true);
        setResult('Генерирую анализ...');

        const dataForLLM = filteredProducts.map(({ productName, storeName, price, date, quantity, unit, category }) => {
            const pricePerUnit = (quantity && quantity > 0) ? (price / quantity).toFixed(2) : 'N/A';
            return {
                productName,
                storeName,
                price,
                date,
                quantity: quantity !== null ? quantity : 'N/A',
                unit: unit !== null ? unit : 'N/A',
                category: category !== null ? category : 'N/A',
                pricePerUnit: pricePerUnit !== 'N/A' ? `${pricePerUnit} €/${unit}` : 'N/A'
            };
        });

        const fullPrompt = `${currentPrompt}

        Данные: ${JSON.stringify(dataForLLM)}`;

        try {
            const chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: fullPrompt }] });
            const payload = { contents: chatHistory };
            const apiKey = "AIzaSyAtuLaWD8b6ZBcqtmmNG14NDoGXARcEzGo"; // <-- Убедитесь, что это ваш реальный API-ключ Gemini
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            // Проверка API ключа перед отправкой запроса
            if (apiKey === "AIzaSyAtuLaWD8b6ZBcqtmmNG14NDoGXARcEzGo" || !apiKey) {
                setResult('Ошибка: API-ключ Gemini не установлен. Пожалуйста, замените "ВАШ_СКОПИРОВАННЫЙ_КЛЮЧ_GEMINI" на ваш реальный ключ.');
                return;
            }


            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("Gemini API Error Response:", errorData);
                setResult(`Ошибка API Gemini: ${errorData.error?.message || response.statusText}. Проверьте ваш API-ключ и данные.`);
                return;
            }

            const result = await response.json();

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const text = result.candidates[0].content.parts[0].text;
                setResult(text);
            } else {
                setResult('Не удалось получить анализ. Ответ Gemini был неожиданным или пустым. Проверьте консоль для получения подробностей.');
                console.error("Unexpected LLM response structure:", result);
            }
        } catch (error) {
            console.error("Ошибка при вызове LLM:", error);
            setResult(`Ошибка при получении анализа: ${error.message}. Возможно, проблемы с сетью или неверный API-ключ.`);
        } finally {
            setLoading(false);
        }
    };

    const analyzePrices = useCallback(() => {
        const defaultPrompt = `Проанализируй следующие данные о ценах на продукты. Учти, что некоторые продукты могут быть весовыми (есть поля 'quantity' и 'unit', а также 'pricePerUnit' - цена за единицу), и имеют категорию ('category'). Валюта - евро (€).

        Представь анализ в виде хорошо структурированного текста.
        Избегай использования таблиц и блоков кода, если это не явно необходимо.
        Предпочтение отдавай заголовкам (например, ## Обзор цен, ### По продуктам, ### По магазинам), жирному тексту для выделения ключевых выводов и маркированным/нумерованным спискам для обобщения информации.
        Разбей информацию на логические секции с подзаголовками, чтобы текст легко читался.
        Сделай анализ максимально кратким и четким, без лишних деталей и вводных фраз. Сосредоточься только на основных выводах и рекомендациях. Убедись, что текст полностью помещается в окно, используя перенос строк, где это необходимо, и не содержит очень длинных слов без пробелов.`;
        fetchAnalysisFromGemini(defaultPrompt, setIsLoadingAnalysis, setAnalysisResult);
    }, [filteredProducts, fetchAnalysisFromGemini]); // Добавили fetchAnalysisFromGemini в зависимости

    const handleCustomAnalysis = useCallback(() => {
        const customPromptPrefix = `На основе следующих данных о ценах на продукты, выполни пользовательский запрос: "${customAnalysisPrompt}".
        Учти, что некоторые продукты могут быть весовыми (есть поля 'quantity' и 'unit', а также 'pricePerUnit' - цена за единицу), и имеют категорию ('category'). Валюта - евро (€).
        Представь анализ в виде хорошо структурированного текста.
        Избегай использования таблиц и блоков кода, если это не явно необходимо.
        Предпочтение отдавай заголовкам, жирному тексту для выделения ключевых выводов и маркированным/нумерованным спискам для обобщения информации.
        Разбей информацию на логические секции с подзаголовками, чтобы текст легко читался.
        Сделай анализ максимально кратким и четким, без лишних деталей и вводных фраз. Сосредоточься только на основных выводах и рекомендациях. Убедись, что текст полностью помещается в окно, используя перенос строк, где это необходимо, и не содержит очень длинных слов без пробелов.`;
        fetchAnalysisFromGemini(customPromptPrefix, setIsLoadingCustomAnalysis, setCustomAnalysisResult);
    }, [customAnalysisPrompt, filteredProducts, fetchAnalysisFromGemini]); // Добавили fetchAnalysisFromGemini в зависимости

    const handleExportCsv = () => {
        if (filteredProducts.length === 0) {
            setMessage('Нет данных для экспорта в CSV.');
            return;
        }

        const headers = [
            'Дата', 'Название продукта', 'Магазин', 'Цена',
            'Количество', 'Единица измерения', 'Категория', 'Цена за ед.'
        ];

        const csvRows = filteredProducts.map(product => {
            const formattedDate = product.originalTimestamp instanceof Date ?
                product.originalTimestamp.toISOString().split('T')[0] : 'N/A';

            const pricePerUnit = (product.quantity && product.quantity > 0) ?
                (product.price / product.quantity).toFixed(2) : 'N/A';

            const escapeCsvField = (field) => {
                if (field === null || field === undefined) return '';
                let stringField = String(field);
                if (stringField.includes(',') || stringField.includes('\n') || stringField.includes('"')) {
                    return `"${stringField.replace(/"/g, '""')}"`;
                }
                return stringField;
            };

            return [
                escapeCsvField(formattedDate),
                escapeCsvField(product.productName),
                escapeCsvField(product.storeName),
                escapeCsvField(product.price.toFixed(2)),
                escapeCsvField(product.quantity !== null ? product.quantity : ''),
                escapeCsvField(product.unit || ''),
                escapeCsvField(product.category || ''),
                escapeCsvField(pricePerUnit !== 'N/A' ? `${pricePerUnit} €/${product.unit || ''}` : '')
            ].join(',');
        });

        const csvString = [headers.join(','), ...csvRows].join('\n');

        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `price_data_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setMessage('Данные успешно экспортированы в CSV.');
    };

    const handleAuth = async (e) => {
        e.preventDefault();
        if (!auth) {
            setMessage('Аутентификация не готова.');
            return;
        }
        try {
            await signInWithEmailAndPassword(auth, email, password);
            setMessage('Успешный вход!');
        } catch (error) {
            console.error("Ошибка аутентификации:", error);
            setMessage(`Ошибка аутентификации: ${error.message}. Проверьте Email и пароль.`);
        }
    };

    const handleLogout = async () => {
        if (!auth) return;
        try {
            await signOut(auth);
            setMessage('Вы вышли из системы.');
            setUserId(null);
        } catch (error) {
            console.error("Ошибка выхода:", error);
            setMessage(`Ошибка выхода: ${error.message}`);
        }
    };

    if (!userId) {
        return (
            <div className="app-container auth-page">
                <div className="auth-card">
                    <h1 className="auth-header">
                        Добро пожаловать в семейный анализатор цен!
                    </h1>
                    {message && (
                        <div className="message-box info">
                            <span>{message}</span>
                        </div>
                    )}
                    <form onSubmit={handleAuth} className="auth-form">
                        <div>
                            <label htmlFor="email" className="form-label">Email</label>
                            <input
                                type="email"
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="ваша@почта.com"
                                className="form-input"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="form-label">Пароль</label>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="********"
                                className="form-input"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            className="btn btn-primary"
                        >
                            Войти
                        </button>
                        <p className="help-text mt-4">
                            Для получения доступа свяжитесь с администратором приложения.
                        </p>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="app-container main-page">
            <div className="main-card">
                <h1 className="main-header">
                    Анализатор цен на продукты
                </h1>
                <div className="header-controls">
                    <p className="user-info">
                        Вы вошли как: <span className="user-email">{auth?.currentUser?.email || 'N/A'}</span>
                    </p>
                    <button
                        onClick={handleLogout}
                        className="btn btn-danger"
                    >
                        Выйти
                    </button>
                </div>
                <p className="user-id-display">
                    Ваш ID пользователя: <span className="user-id-value">{userId || 'Загрузка...'}</span>
                </p>
                {message && (
                    <div className="message-box info">
                        <span>{message}</span>
                    </div>
                )}

                <div className="input-mode-toggle-container">
                    <button
                        onClick={() => setInputMode('single')}
                        className={`btn ${inputMode === 'single' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        Поштучная загрузка
                    </button>
                    <button
                        onClick={() => setInputMode('bulk')}
                        className={`btn ${inputMode === 'bulk' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        Загрузка списком
                    </button>
                </div>

                {inputMode === 'single' ? (
                    <form onSubmit={handleAddOrUpdateProduct} className="form-section">
                        <h2 className="section-header">Добавить/Обновить продукт (поштучно)</h2>
                        <div className="form-grid">
                            <div className="form-field">
                                <label htmlFor="purchaseDate" className="form-label">Дата покупки</label>
                                <input
                                    type="date"
                                    id="purchaseDate"
                                    value={purchaseDate}
                                    onChange={(e) => setPurchaseDate(e.target.value)}
                                    className="form-input"
                                />
                            </div>
                            <div className="form-field">
                                <label htmlFor="productName" className="form-label">Название продукта</label>
                                <input
                                    type="text"
                                    id="productName"
                                    value={productName}
                                    onChange={(e) => setProductName(e.target.value)}
                                    placeholder="Молоко"
                                    list="productNames"
                                    className="form-input"
                                    required
                                />
                                <datalist id="productNames">
                                    {uniqueProductNames.map((name, index) => (
                                        <option key={index} value={name} />
                                    ))}
                                </datalist>
                            </div>
                            <div className="form-field">
                                <label htmlFor="storeName" className="form-label">Магазин</label>
                                <input
                                    type="text"
                                    id="storeName"
                                    value={storeName}
                                    onChange={(e) => setStoreName(e.target.value)}
                                    placeholder="Пятерочка"
                                    className="form-input"
                                    required
                                />
                            </div>
                            <div className="form-field">
                                <label htmlFor="price" className="form-label">Цена</label>
                                <input
                                    type="number"
                                    id="price"
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    placeholder="120.50"
                                    step="0.01"
                                    className="form-input"
                                    required
                                />
                            </div>
                            <div className="form-field">
                                <label htmlFor="quantity" className="form-label">Количество</label>
                                <input
                                    type="number"
                                    id="quantity"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    placeholder="1"
                                    step="any"
                                    className="form-input"
                                />
                            </div>
                            <div className="form-field">
                                <label htmlFor="unit" className="form-label">Единица измерения</label>
                                <input
                                    type="text"
                                    id="unit"
                                    value={unit}
                                    onChange={(e) => setUnit(e.target.value)}
                                    placeholder="шт., кг, л"
                                    className="form-input"
                                />
                            </div>
                            <div className="form-field">
                                <label htmlFor="category" className="form-label">Категория</label>
                                <input
                                    type="text"
                                    id="category"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    placeholder="Молочные продукты"
                                    list="categories"
                                    className="form-input"
                                />
                                <datalist id="categories">
                                    {uniqueCategories.map((cat, index) => (
                                        <option key={index} value={cat} />
                                    ))}
                                </datalist>
                            </div>
                        </div>
                        <div className="form-actions">
                            <button
                                type="submit"
                                className="btn btn-primary btn-submit"
                            >
                                {editingProductId ? 'Обновить продукт' : 'Добавить продукт'}
                            </button>
                            {editingProductId && (
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="btn btn-secondary btn-cancel"
                                >
                                    Отмена
                                </button>
                            )}
                        </div>
                    </form>
                ) : (
                    <form onSubmit={handleBulkAddProducts} className="form-section">
                        <h2 className="section-header">Массовая загрузка покупок</h2>
                        <p className="help-text">
                            Введите каждую покупку на новой строке, используя формат:
                            <br /><code className="code-block">Дата (ГГГГ-ММ-ДД),Название продукта,Магазин,Цена,Количество (необязательно),Единица измерения (необязательно),Категория (необязательно)</code>
                            <br />Пример: <code className="code-block">2024-05-20,Молоко,Пятерочка,1.50,1,л,Молочные продукты</code>
                            <br />Пример (без количества/единицы/категории): <code className="code-block">2024-05-21,Хлеб,Магнит,0.80</code>
                        </p>
                        <textarea
                            className="form-textarea"
                            placeholder="Введите список покупок здесь..."
                            value={bulkInputText}
                            onChange={(e) => setBulkInputText(e.target.value)}
                        ></textarea>
                        <button
                            type="submit"
                            className="btn btn-primary btn-submit mt-4"
                        >
                            Добавить список продуктов
                        </button>
                    </form>
                )}


                <div className="section-card">
                    <h2 className="section-header">Фильтры</h2>
                    <div className="form-grid-filters">
                        <div className="form-field">
                            <label htmlFor="filterProduct" className="form-label">Фильтр по названию продукта</label>
                            <input
                                type="text"
                                id="filterProduct"
                                value={filterProduct}
                                onChange={(e) => setFilterProduct(e.target.value)}
                                placeholder="Например, Хлеб"
                                className="form-input"
                            />
                        </div>
                        <div className="form-field">
                            <label htmlFor="filterStore" className="form-label">Фильтр по магазину</label>
                            <input
                                type="text"
                                id="filterStore"
                                value={filterStore}
                                onChange={(e) => setFilterStore(e.target.value)}
                                placeholder="Например, Ашан"
                                className="form-input"
                            />
                        </div>
                        <div className="form-field">
                            <label htmlFor="filterCategory" className="form-label">Фильтр по категории</label>
                            <input
                                type="text"
                                id="filterCategory"
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                                placeholder="Например, Овощи"
                                list="categoriesFilter"
                                className="form-input"
                            />
                            <datalist id="categoriesFilter">
                                {uniqueCategories.map((cat, index) => (
                                    <option key={index} value={cat} />
                                ))}
                            </datalist>
                        </div>
                    </div>
                </div>

                <div className="section-card no-padding-top">
                    <h2 className="section-header-padded">Ваши продукты</h2>
                    {filteredProducts.length === 0 ? (
                        <p className="no-data-message">Нет данных для отображения. Добавьте новые продукты или измените фильтры.</p>
                    ) : (
                        <div className="table-responsive">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Дата</th>
                                        <th>Продукт</th>
                                        <th>Магазин</th>
                                        <th>Количество</th>
                                        <th>Ед. изм.</th>
                                        <th>Категория</th>
                                        <th>Цена</th>
                                        <th>Цена за ед.</th>
                                        <th>Действия</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredProducts.map((product) => {
                                        const pricePerUnit = (product.quantity && product.quantity > 0) ? (product.price / product.quantity).toFixed(2) : 'N/A';
                                        return (
                                            <tr key={product.id}>
                                                <td>{product.date}</td>
                                                <td>{product.productName}</td>
                                                <td>{product.storeName}</td>
                                                <td>{product.quantity !== null ? product.quantity : 'N/A'}</td>
                                                <td>{product.unit || 'N/A'}</td>
                                                <td>{product.category || 'N/A'}</td>
                                                <td>{product.price.toFixed(2)} €</td>
                                                <td>
                                                    {pricePerUnit !== 'N/A' ? `${pricePerUnit} €/${product.unit || ''}` : 'N/A'}
                                                </td>
                                                <td className="actions-cell">
                                                    <button
                                                        onClick={() => handleEditProduct(product)}
                                                        className="btn-link-edit"
                                                    >
                                                        Редактировать
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteClick(product)}
                                                        className="btn-link-delete"
                                                    >
                                                        Удалить
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className="export-controls">
                        <button
                            onClick={handleExportCsv}
                            className="btn btn-secondary btn-full-width"
                            disabled={filteredProducts.length === 0}
                        >
                            Экспорт в CSV
                        </button>
                    </div>
                </div>

                {/* Общий анализ цен */}
                <div className="section-card">
                    <h2 className="section-header">Общий анализ цен</h2>
                    <button
                        onClick={analyzePrices}
                        disabled={isLoadingAnalysis || filteredProducts.length === 0}
                        className={`btn btn-primary btn-full-width ${isLoadingAnalysis || filteredProducts.length === 0 ? 'disabled' : ''}`}
                    >
                        {isLoadingAnalysis ? 'Анализирую...' : 'Получить общий анализ цен'}
                    </button>
                    <div className="analysis-result-box">
                        {analysisResult ? (
                            // Убран remarkPlugins, чтобы избежать ошибки компиляции
                            <ReactMarkdown className="analysis-text">
                                {analysisResult}
                            </ReactMarkdown>
                        ) : (
                            <p className="placeholder-text">Нажмите "Получить общий анализ цен", чтобы сгенерировать отчет.</p>
                        )}
                    </div>
                </div>

                {/* Свободный запрос к Gemini */}
                <div className="section-card custom-analysis-section"> {/* Added custom-analysis-section class */}
                    <h2 className="section-header">Пользовательский анализ (свободный запрос)</h2>
                    <p className="help-text">
                        Введите ваш запрос для анализа (например, "Какие продукты из категории 'Молочные продукты' самые дорогие?", "Сравните цены на 'Хлеб' в разных магазинах", "Какие продукты я покупал в 'Пятерочке' за последний месяц?").
                        Анализ будет выполнен на основе текущих отфильтрованных данных.
                    </p>
                    <textarea
                        className="form-textarea custom-analysis-textarea" // Added custom-analysis-textarea class
                        placeholder="Введите ваш запрос к Gemini здесь..."
                        value={customAnalysisPrompt}
                        onChange={(e) => setCustomAnalysisPrompt(e.target.value)}
                        rows="4"
                    ></textarea>
                    <button
                        onClick={handleCustomAnalysis}
                        disabled={isLoadingCustomAnalysis || !customAnalysisPrompt.trim() || filteredProducts.length === 0}
                        className={`btn btn-primary btn-full-width mt-4 ${isLoadingCustomAnalysis || !customAnalysisPrompt.trim() || filteredProducts.length === 0 ? 'disabled' : ''}`}
                    >
                        {isLoadingCustomAnalysis ? 'Выполняю запрос...' : 'Получить пользовательский анализ'}
                    </button>
                    <div className="analysis-result-box mt-4 custom-analysis-result-box"> {/* Added custom-analysis-result-box class */}
                        {customAnalysisResult ? (
                            // Убран remarkPlugins, чтобы избежать ошибки компиляции
                            <ReactMarkdown className="analysis-text">
                                {customAnalysisResult}
                            </ReactMarkdown>
                        ) : (
                            <p className="placeholder-text">Результат пользовательского анализа появится здесь.</p>
                        )}
                    </div>
                </div>
            </div>

            {showConfirmModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3 className="modal-header">Подтверждение удаления</h3>
                        <p className="modal-message">
                            Вы уверены, что хотите удалить запись о продукте "
                            <span className="font-semibold">{productToDelete?.productName}</span>" из магазина "
                            <span className="font-semibold">{productToDelete?.storeName}</span>" от "
                            <span className="font-semibold">{productToDelete?.date}</span>"?
                        </p>
                        <div className="modal-actions">
                            <button
                                onClick={() => setShowConfirmModal(false)}
                                className="btn btn-secondary"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="btn btn-danger"
                            >
                                Удалить
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
