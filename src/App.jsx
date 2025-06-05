import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';

// Импортируем библиотеку для рендеринга Markdown
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'; // Для поддержки таблиц, зачеркнутого текста и т.д.

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
    const [isLoginMode, setIsLoginMode] = useState(true); // true for login, false for signup. Убран для упрощения регистрации

    // Input mode state: 'single' or 'bulk'
    const [inputMode, setInputMode] = useState('single');
    const [bulkInputText, setBulkInputText] = useState('');

    // Firebase Configuration (REPLACE THESE WITH YOUR ACTUAL FIREBASE CONFIG)
    // You will get this from your Firebase project settings.
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
    // Используйте что-то уникальное, например: "my-family-prices-2025" или "lavrenkov-family-tracker"
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

            // Listen for auth state changes to get the user ID
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
    }, [firebaseConfig]); // Re-run if config changes (though it shouldn't in a real app)

    // Fetch products from Firestore when db and userId are available, and public/private toggle changes
    useEffect(() => {
        if (!db || !userId) {
            setProducts([]); // Clear products if not authenticated or db not ready
            return;
        }

        // Теперь всегда ссылаемся на общую семейную коллекцию
        const productsCollectionRef = collection(db, `artifacts/${appId}/families/${FAMILY_SHARED_LIST_ID}/prices`);

        const q = query(productsCollectionRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedProducts = snapshot.docs.map(doc => {
                const data = doc.data();
                // Handle date conversion: Firestore Timestamp to 'DD.MM.YYYY' string
                const displayDate = data.date?.toDate().toLocaleDateString('ru-RU') || 'N/A';
                return {
                    id: doc.id,
                    ...data,
                    date: displayDate, // Store formatted date for display
                    // Keep original timestamp for sorting if needed, or parse back
                    originalTimestamp: data.date?.toDate() || new Date(0) // Use epoch for 'N/A' dates
                };
            });
            // Sort products by original timestamp in descending order in memory
            fetchedProducts.sort((a, b) => b.originalTimestamp.getTime() - a.originalTimestamp.getTime());
            setProducts(fetchedProducts);
        }, (error) => {
            console.error("Ошибка получения данных из Firestore:", error);
            setMessage(`Ошибка загрузки данных: ${error.message}`);
        });

        return () => unsubscribe(); // Cleanup snapshot listener
    }, [db, userId, appId, FAMILY_SHARED_LIST_ID]); // FAMILY_SHARED_LIST_ID добавлен в зависимости

    // Function to reset form fields
    const resetForm = () => {
        setProductName('');
        setStoreName('');
        setPrice('');
        setQuantity('');
        setUnit('');
        setCategory(''); // Reset category
        setPurchaseDate(new Date().toISOString().split('T')[0]);
        setEditingProductId(null);
    };

    // Handle adding or updating a product (single entry)
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
                category: category.trim() || null, // Save category
            };

            // Теперь всегда ссылаемся на общую семейную коллекцию
            const targetCollectionRef = collection(db, `artifacts/${appId}/families/${FAMILY_SHARED_LIST_ID}/prices`);

            if (editingProductId) {
                // Update existing product
                const productRef = doc(db, targetCollectionRef.path, editingProductId);
                await updateDoc(productRef, productData);
                setMessage('Продукт успешно обновлен!');
            } else {
                // Add new product
                await addDoc(targetCollectionRef, productData);
                setMessage('Продукт успешно добавлен!');
            }
            resetForm();
        } catch (error) {
            console.error("Ошибка сохранения продукта:", error);
            setMessage(`Ошибка сохранения продукта: ${error.message}`);
        }
    };

    // Handle bulk adding products
    const handleBulkAddProducts = async (e) => {
        e.preventDefault();
        if (!bulkInputText.trim()) {
            setMessage('Пожалуйста, введите данные для массовой загрузки.');
            return;
        }
        if (!db || !userId) {
            setMessage('База данных не готова или вы не вошли в систему.');
            return;
        }

        const lines = bulkInputText.trim().split('\n');
        const productsToAdd = [];
        let errorCount = 0;

        for (const line of lines) {
            const parts = line.split(',').map(part => part.trim());
            // Expected format: Date,ProductName,StoreName,Price,Quantity,Unit,Category
            // Example: 2024-05-20,Молоко,Пятерочка,1.50,1,л,Молочные продукты
            if (parts.length >= 4) { // Minimum required: Date, ProductName, StoreName, Price
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
                        category: pCategory || null, // Parse category
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
            // Теперь всегда ссылаемся на общую семейную коллекцию
            const targetCollectionRef = collection(db, `artifacts/${appId}/families/${FAMILY_SHARED_LIST_ID}/prices`);

            const addPromises = productsToAdd.map(product => addDoc(targetCollectionRef, product));
            await Promise.all(addPromises);

            setMessage(`Успешно добавлено ${productsToAdd.length} продуктов. Ошибок в строках: ${errorCount}`);
            setBulkInputText(''); // Clear textarea after successful import
        } catch (error) {
            console.error("Ошибка массового добавления продуктов:", error);
            setMessage(`Ошибка массового добавления продуктов: ${error.message}`);
        }
    };

    // Handle editing a product
    const handleEditProduct = (product) => {
        setEditingProductId(product.id);
        setProductName(product.productName);
        setStoreName(product.storeName);
        setPrice(product.price);
        setQuantity(product.quantity || '');
        setUnit(product.unit || '');
        setCategory(product.category || ''); // Load category
        // Convert 'DD.MM.YYYY' back to 'YYYY-MM-DD' for the date input
        const [day, month, year] = product.date.split('.');
        setPurchaseDate(`${year}-${month}-${day}`);
        setInputMode('single'); // Switch to single input mode when editing
    };

    // Handle deleting a product (show confirmation modal)
    const handleDeleteClick = (product) => {
        setProductToDelete(product);
        setShowConfirmModal(true);
    };

    // Confirm deletion
    const confirmDelete = async () => {
        if (!productToDelete || !db || !userId) {
            setMessage('Ошибка: Не удалось удалить продукт.');
            setShowConfirmModal(false);
            setProductToDelete(null);
            return;
        }
        try {
            // Теперь всегда ссылаемся на общую семейную коллекцию
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

    // Filtered products based on user input
    const filteredProducts = products.filter(product => {
        const matchesProduct = filterProduct ? product.productName.toLowerCase().includes(filterProduct.toLowerCase()) : true;
        const matchesStore = filterStore ? product.storeName.toLowerCase().includes(filterStore.toLowerCase()) : true;
        const matchesCategory = filterCategory ? product.category?.toLowerCase().includes(filterCategory.toLowerCase()) : true; // Filter by category
        return matchesProduct && matchesStore && matchesCategory;
    });

    // Get unique product names for datalist suggestions
    const uniqueProductNames = Array.from(new Set(products.map(p => p.productName))).sort();
    // Get unique categories for datalist suggestions
    const uniqueCategories = Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort(); // filter(Boolean) removes null/undefined

    // Function to call the LLM for analysis
    const analyzePrices = useCallback(async () => {
        if (!filteredProducts.length) {
            setAnalysisResult('Нет данных для анализа. Добавьте хотя бы один продукт.');
            return;
        }

        setIsLoadingAnalysis(true);
        setAnalysisResult('Генерирую анализ...');

        // Prepare data for LLM, including category
        const dataForLLM = filteredProducts.map(({ productName, storeName, price, date, quantity, unit, category }) => {
            const pricePerUnit = (quantity && quantity > 0) ? (price / quantity).toFixed(2) : 'N/A';
            return {
                productName,
                storeName,
                price,
                date,
                quantity: quantity !== null ? quantity : 'N/A',
                unit: unit !== null ? unit : 'N/A',
                category: category !== null ? category : 'N/A', // Include category in LLM data
                pricePerUnit: pricePerUnit !== 'N/A' ? `${pricePerUnit} €/${unit}` : 'N/A'
            };
        });

        // МОДИФИЦИРОВАННЫЙ ПРОМПТ: Просим Gemini использовать Markdown для форматирования
        const prompt = `Проанализируй следующие данные о ценах на продукты. Учти, что некоторые продукты могут быть весовыми (есть поля 'quantity' и 'unit', а также 'pricePerUnit' - цена за единицу), и имеют категорию ('category'). Валюта - евро (€).

        Представь анализ в виде хорошо структурированного текста, используя **Markdown** для улучшения читаемости:
        - Используй заголовки (например, ## Обзор цен, ### По продуктам, ### По магазинам).
        - Используй жирный текст для выделения ключевых выводов.
        - Используй списки (маркированные или нумерованные) для перечисления пунктов.
        - Можешь использовать таблицы для сравнения цен, если это уместно.

        Данные: ${JSON.stringify(dataForLLM)}`;

        try {
            const chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: prompt }] });
            const payload = { contents: chatHistory };
            const apiKey = "AIzaSyAtuLaWD8b6ZBcqtmmNG14NDoGXARcEzGo"; // Вставьте ваш API-ключ Gemini здесь
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const text = result.candidates[0].content.parts[0].text;
                setAnalysisResult(text);
            } else {
                setAnalysisResult('Не удалось получить анализ. Попробуйте еще раз.');
                console.error("Unexpected LLM response structure:", result);
            }
        } catch (error) {
            console.error("Ошибка при вызове LLM:", error);
            setAnalysisResult(`Ошибка при получении анализа: ${error.message}`);
        } finally {
            setIsLoadingAnalysis(false);
        }
    }, [filteredProducts]);

    // Function to handle CSV export
    const handleExportCsv = () => {
        if (filteredProducts.length === 0) {
            setMessage('Нет данных для экспорта в CSV.');
            return;
        }

        const headers = [
            'Дата', 'Название продукта', 'Магазин', 'Цена',
            'Количество', 'Единица измерения', 'Категория', 'Цена за ед.'
        ];

        // Format data for CSV
        const csvRows = filteredProducts.map(product => {
            // Ensure date is in ISO format (YYYY-MM-DD) for CSV
            const formattedDate = product.originalTimestamp instanceof Date ?
                product.originalTimestamp.toISOString().split('T')[0] : 'N/A';

            const pricePerUnit = (product.quantity && product.quantity > 0) ?
                (product.price / product.quantity).toFixed(2) : 'N/A';

            // Escape commas and newlines in string fields
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

        // Combine headers and rows
        const csvString = [headers.join(','), ...csvRows].join('\n');

        // Create a Blob and download link
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `price_data_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setMessage('Данные успешно экспортированы в CSV.');
    };

    // Handle user login/signup
    const handleAuth = async (e) => {
        e.preventDefault();
        if (!auth) {
            setMessage('Аутентификация не готова.');
            return;
        }
        try {
            // Для семейного доступа, регистрация происходит только через консоль Firebase.
            // Здесь мы только пытаемся войти в систему.
            await signInWithEmailAndPassword(auth, email, password);
            setMessage('Успешный вход!');
        } catch (error) {
            console.error("Ошибка аутентификации:", error);
            setMessage(`Ошибка аутентификации: ${error.message}. Проверьте Email и пароль.`);
        }
    };

    // Handle user logout
    const handleLogout = async () => {
        if (!auth) return;
        try {
            await signOut(auth);
            setMessage('Вы вышли из системы.');
            setUserId(null); // Clear userId on logout
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

                {/* Убран переключатель Public/Private Data */}
                {/* Убран переключатель Input Mode, так как для общего списка он не особо нужен.
                    Если понадобится, его можно вернуть. Сейчас оставлен только один режим ввода. */}
                {/* Conditional Form Rendering (теперь всегда одна форма ввода) */}
                <form onSubmit={handleAddOrUpdateProduct} className="form-section">
                    <h2 className="section-header">Добавить/Обновить продукт</h2>
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

                {/* Фильтры */}
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

                {/* Таблица данных */}
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

                {/* Анализ цен с помощью LLM */}
                <div className="section-card">
                    <h2 className="section-header">Анализ цен</h2>
                    <button
                        onClick={analyzePrices}
                        disabled={isLoadingAnalysis || filteredProducts.length === 0}
                        className={`btn btn-primary btn-full-width ${isLoadingAnalysis || filteredProducts.length === 0 ? 'disabled' : ''}`}
                    >
                        {isLoadingAnalysis ? 'Анализирую...' : 'Получить анализ цен'}
                    </button>
                    <div className="analysis-result-box">
                        {analysisResult ? (
                            // Используем ReactMarkdown для рендеринга форматированного текста
                            <ReactMarkdown remarkPlugins={[remarkGfm]} className="analysis-text">
                                {analysisResult}
                            </ReactMarkdown>
                        ) : (
                            <p className="placeholder-text">Нажмите "Получить анализ цен", чтобы сгенерировать отчет.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Confirmation Modal */}
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
