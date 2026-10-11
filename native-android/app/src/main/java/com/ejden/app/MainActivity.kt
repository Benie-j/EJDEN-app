package com.ejden.app

import android.os.Bundle
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import kotlinx.coroutines.delay
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.geometry.Offset
import androidx.compose.foundation.Canvas
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.RepeatMode
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.PointOfSale
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ejden.app.ui.theme.*

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            var darkMode by remember { mutableStateOf(false) }

            MaterialTheme(
                colorScheme = if (darkMode) {
                    darkColorScheme(
                        primary = EjdenBlue,
                        secondary = EjdenLightBlue,
                        background = Color(0xFF10191D),
                        surface = Color(0xFF19252A),
                        onBackground = Color(0xFFF4F7F8),
                        onSurface = Color(0xFFF4F7F8)
                    )
                } else {
                    lightColorScheme(
                        primary = EjdenBlue,
                        secondary = EjdenDarkBlue,
                        background = EjdenBackground,
                        surface = EjdenSurface,
                        onBackground = EjdenText,
                        onSurface = EjdenText
                    )
                }
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    EjdenApp(
                        darkMode = darkMode,
                        onThemeChange = { darkMode = it }
                    )
                }
            }
        }
    }
}

@Composable
private fun EjdenApp(
    darkMode: Boolean,
    onThemeChange: (Boolean) -> Unit
) {
    var showSplash by remember { mutableStateOf(true) }
    var showDashboard by remember { mutableStateOf(false) }
    var showProducts by remember { mutableStateOf(false) }

    BackHandler(enabled = showProducts || (showDashboard && !showSplash)) {
        if (showProducts) showProducts = false else showDashboard = false
    }

    LaunchedEffect(Unit) {
        delay(5000)
        showSplash = false
    }

    when {
        showSplash -> SplashScreen()
        showProducts -> ProductsScreen(onBack = { showProducts = false })
        showDashboard -> DashboardScreen(
            darkMode = darkMode,
            onThemeChange = onThemeChange,
            onOpenProducts = { showProducts = true }
        )
        else -> WelcomeScreen(
            onContinue = { showDashboard = true }
        )
    }
}

@Composable
private fun SplashScreen() {
    val transition = rememberInfiniteTransition(label = "ejdenSplash")
    val pulse by transition.animateFloat(
        initialValue = 0.96f,
        targetValue = 1.04f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400),
            repeatMode = RepeatMode.Reverse
        ),
        label = "logoPulse"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                androidx.compose.ui.graphics.Brush.linearGradient(
                    colors = listOf(
                        Color(0xFFF9FCFD),
                        Color(0xFFF6F9FA),
                        Color(0xFFEEF6F8)
                    )
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .size(150.dp)
                .background(
                    EjdenBlue.copy(alpha = 0.035f),
                    CircleShape
                ),
            contentAlignment = Alignment.Center
        ) {
            EjdenLogo(
                modifier = Modifier
                    .size(118.dp)
                    .graphicsLayer {
                        scaleX = pulse
                        scaleY = pulse
                    },
                color = EjdenBlue,
                haloAlpha = 0.12f
            )
        }
    }
}

@Composable
private fun EjdenLogo(
    modifier: Modifier = Modifier,
    color: Color = EjdenBlue,
    haloAlpha: Float = 0.08f
) {
    Canvas(modifier = modifier) {
        val sx = size.width / 120f
        val sy = size.height / 120f

        withTransform({
            scale(sx, sy, pivot = Offset.Zero)
        }) {
            drawCircle(
                color = color.copy(alpha = haloAlpha),
                radius = 48f,
                center = Offset(60f, 60f),
                style = Stroke(width = 1.2f)
            )

            val line1 = Path().apply {
                moveTo(34f, 38f)
                cubicTo(42f, 28f, 54f, 24f, 67f, 28f)
                lineTo(84f, 38f)
            }

            val line2 = Path().apply {
                moveTo(34f, 38f)
                lineTo(34f, 63f)
                cubicTo(34f, 72f, 41f, 79f, 50f, 79f)
            }

            val line3 = Path().apply {
                moveTo(50f, 79f)
                lineTo(67f, 92f)
                cubicTo(72f, 96f, 80f, 95f, 84f, 90f)
            }

            val line4 = Path().apply {
                moveTo(84f, 38f)
                lineTo(84f, 65f)
                cubicTo(84f, 75f, 78f, 82f, 68f, 82f)
                lineTo(50f, 82f)
            }

            val lineStyle = Stroke(
                width = 7f,
                cap = androidx.compose.ui.graphics.StrokeCap.Round,
                join = androidx.compose.ui.graphics.StrokeJoin.Round
            )

            drawPath(line1, color, style = lineStyle)
            drawPath(line2, color, style = lineStyle)
            drawPath(line3, color, style = lineStyle)
            drawPath(line4, color, style = lineStyle)

            drawLine(
                color = color,
                start = Offset(49f, 58f),
                end = Offset(70f, 58f),
                strokeWidth = 5f,
                cap = androidx.compose.ui.graphics.StrokeCap.Round
            )

            drawCircle(
                color = color,
                radius = 4f,
                center = Offset(60f, 58f)
            )
        }
    }
}

@Composable
private fun WelcomeScreen(onContinue: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                androidx.compose.ui.graphics.Brush.linearGradient(
                    colors = listOf(
                        Color(0xFFF9FCFD),
                        Color(0xFFF6F9FA),
                        Color(0xFFEEF6F8)
                    )
                )
            )
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        EjdenLogo(
            modifier = Modifier.size(92.dp),
            color = EjdenBlue
        )

        Spacer(modifier = Modifier.height(14.dp))

        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "EJDEN",
                fontSize = 19.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 5.3.sp,
                color = Color(0xFF172126)
            )

            Spacer(modifier = Modifier.height(8.dp))

            Box(
                modifier = Modifier
                    .width(26.dp)
                    .height(2.dp)
                    .background(EjdenBlue, RoundedCornerShape(999.dp))
            )
        }

        Spacer(modifier = Modifier.height(46.dp))

        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "VOTRE ESPACE DE GESTION",
                fontSize = 11.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 1.5.sp,
                color = EjdenBlue,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(13.dp))

            Text(
                text = "Votre espace EJDEN est prêt.",
                fontSize = 32.sp,
                lineHeight = 35.sp,
                letterSpacing = (-1).sp,
                fontWeight = FontWeight.ExtraBold,
                color = Color(0xFF172126),
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(17.dp))


        }

        // Les trois blocs Produits, Ventes et Clients
        // sont volontairement supprimés de cet écran.

        Spacer(modifier = Modifier.height(30.dp))

        Button(
            onClick = onContinue,
            modifier = Modifier
                .fillMaxWidth()
                .height(58.dp),
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = EjdenBlue,
                contentColor = Color.White
            ),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                start = 22.dp,
                end = 12.dp,
                top = 0.dp,
                bottom = 0.dp
            )
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Accéder à mon espace",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold
                )

                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .background(
                            Color.White.copy(alpha = 0.12f),
                            RoundedCornerShape(10.dp)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    androidx.compose.material3.Icon(
                        imageVector = Icons.Default.ArrowForward,
                        contentDescription = "Accéder à mon espace",
                        modifier = Modifier.size(20.dp),
                        tint = Color.White
                    )
                }
            }
        }

    }
}


@Composable
private fun DashboardScreen(
    darkMode: Boolean,
    onThemeChange: (Boolean) -> Unit,
    onOpenProducts: () -> Unit
) {
    var infoDialog by remember { mutableStateOf<String?>(null) }

    val primary = Color(0xFF176B87)
    val background = Color(0xFFF5F7F8)
    val surface = Color(0xFFFFFFFF)
    val text = Color(0xFF172126)
    val secondary = Color(0xFF68777D)
    val border = Color(0xFFE2E8EA)
    val success = Color(0xFF168A5B)
    val warning = Color(0xFFD98A16)
    val error = Color(0xFFD64545)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(background)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(bottom = 100.dp)
        ) {
            // Barre supérieure : logo, nom, notifications et espace personnel.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(surface)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                EjdenLogo(
                    modifier = Modifier.size(38.dp),
                    color = primary
                )

                Spacer(Modifier.size(9.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "EJDEN",
                        color = text,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 1.2.sp
                    )
                    Text(
                        "Bonjour",
                        color = secondary,
                        fontSize = 11.sp
                    )
                }

                androidx.compose.material3.IconButton(
                    onClick = {
                        infoDialog = "Les notifications seront reliées à vos données lors de la migration de ce module."
                    }
                ) {
                    Icon(
                        Icons.Default.Notifications,
                        contentDescription = "Notifications",
                        tint = secondary
                    )
                }

                Surface(
                    shape = CircleShape,
                    color = Color(0xFFEAF4F7),
                    modifier = Modifier.clickable {
                        infoDialog = "L'espace personnel et les paramètres seront raccordés lors d'une prochaine étape."
                    }
                ) {
                    Box(
                        modifier = Modifier.size(34.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "E",
                            color = primary,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            Column(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 22.dp)
            ) {
                // Titre et actions de période.
                Text(
                    "TABLEAU DE BORD",
                    color = primary,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 1.4.sp
                )

                Spacer(Modifier.height(5.dp))

                Text(
                    "Vue générale",
                    color = text,
                    fontSize = 26.sp,
                    lineHeight = 31.sp,
                    fontWeight = FontWeight.ExtraBold
                )

                Spacer(Modifier.height(5.dp))

                Text(
                    "Suivez votre activité et prenez les bonnes décisions.",
                    color = secondary,
                    fontSize = 12.sp,
                    lineHeight = 18.sp
                )

                Spacer(Modifier.height(16.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(9.dp)
                ) {
                    OutlinedDashboardAction(
                        label = "Aujourd'hui",
                        icon = {
                            Icon(
                                Icons.Default.CalendarMonth,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                        },
                        modifier = Modifier.weight(1f),
                        onClick = {
                            infoDialog = "Le sélecteur de période sera raccordé aux indicateurs lors de la migration des données."
                        }
                    )

                    Button(
                        onClick = {
                            infoDialog = "Le module Nouvelle vente sera migré après validation du tableau de bord."
                        },
                        modifier = Modifier.weight(1.25f).height(42.dp),
                        shape = RoundedCornerShape(9.dp),
                        colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                            containerColor = primary
                        ),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(
                            horizontal = 9.dp
                        )
                    ) {
                        Icon(
                            Icons.Default.Add,
                            contentDescription = null,
                            modifier = Modifier.size(17.dp)
                        )
                        Spacer(Modifier.size(4.dp))
                        Text(
                            "Nouvelle vente",
                            fontSize = 11.sp,
                            maxLines = 1
                        )
                    }
                }

                Spacer(Modifier.height(17.dp))

                // Quatre indicateurs du tableau de bord web.
                Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(9.dp)
                    ) {
                        DashboardKpi(
                            "Chiffre d'affaires",
                            "—",
                            "FCFA",
                            "Aujourd'hui",
                            primary,
                            surface,
                            text,
                            secondary,
                            border,
                            Modifier.weight(1f)
                        )
                        DashboardKpi(
                            "Ventes",
                            "0",
                            "transaction",
                            "Aujourd'hui",
                            primary,
                            surface,
                            text,
                            secondary,
                            border,
                            Modifier.weight(1f)
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(9.dp)
                    ) {
                        DashboardKpi(
                            "Marge estimée",
                            "—",
                            "FCFA",
                            "Aujourd'hui",
                            primary,
                            surface,
                            text,
                            secondary,
                            border,
                            Modifier.weight(1f)
                        )
                        DashboardKpi(
                            "Trésorerie",
                            "—",
                            "FCFA",
                            "Actuelle",
                            primary,
                            surface,
                            text,
                            secondary,
                            border,
                            Modifier.weight(1f)
                        )
                    }
                }

                Spacer(Modifier.height(16.dp))

                // Graphique des ventes.
                DashboardPanel(
                    background = surface,
                    border = border
                ) {
                    Text(
                        "ACTIVITÉ COMMERCIALE",
                        color = primary,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 1.1.sp
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Évolution des ventes",
                        color = text,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )

                    Spacer(Modifier.height(13.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "Chiffre d'affaires",
                                color = secondary,
                                fontSize = 11.sp
                            )
                            Text(
                                "0 FCFA",
                                color = text,
                                fontSize = 19.sp,
                                fontWeight = FontWeight.ExtraBold
                            )
                        }

                        Text(
                            "7 derniers jours",
                            color = primary,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.clickable {
                                infoDialog = "Les périodes du graphique seront activées avec les données de ventes."
                            }
                        )
                    }

                    Spacer(Modifier.height(12.dp))

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(190.dp)
                            .background(
                                background,
                                RoundedCornerShape(10.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(horizontal = 14.dp, vertical = 22.dp),
                            verticalArrangement = Arrangement.SpaceBetween
                        ) {
                            repeat(5) {
                                Box(
                                    Modifier
                                        .fillMaxWidth()
                                        .height(1.dp)
                                        .background(border)
                                )
                            }
                        }

                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                "Pas encore de données",
                                color = text,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "Votre graphique apparaîtra après vos premières ventes.",
                                color = secondary,
                                fontSize = 10.sp,
                                textAlign = TextAlign.Center
                            )
                        }
                    }

                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Touchez une barre pour voir le détail.",
                        color = secondary,
                        fontSize = 10.sp
                    )
                }

                Spacer(Modifier.height(12.dp))

                // Caisse.
                DashboardPanel(background, border) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "TRÉSORERIE",
                                color = primary,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = 1.1.sp
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "Caisse",
                                color = text,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Text(
                            "Voir",
                            color = primary,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.clickable {
                                infoDialog = "Le détail de la caisse sera disponible après la migration de ce module."
                            }
                        )
                    }

                    Spacer(Modifier.height(15.dp))

                    Text("Solde actuel", color = secondary, fontSize = 11.sp)
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "—",
                            color = text,
                            fontSize = 28.sp,
                            fontWeight = FontWeight.ExtraBold
                        )
                        Spacer(Modifier.size(7.dp))
                        Text("FCFA", color = secondary, fontSize = 11.sp)
                    }

                    Spacer(Modifier.height(13.dp))

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(background, RoundedCornerShape(10.dp))
                            .padding(13.dp)
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Entrées", color = secondary, fontSize = 11.sp)
                            Spacer(Modifier.height(4.dp))
                            Text("— FCFA", color = success, fontWeight = FontWeight.Bold)
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Sorties", color = secondary, fontSize = 11.sp)
                            Spacer(Modifier.height(4.dp))
                            Text("— FCFA", color = error, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))

                // Dernières ventes.
                DashboardPanel(background, border) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "COMMERCE",
                                color = primary,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = 1.1.sp
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "Dernières ventes",
                                color = text,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Text(
                            "Toutes les ventes",
                            color = primary,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.clickable {
                                infoDialog = "L'historique des ventes sera migré dans une prochaine étape."
                            }
                        )
                    }

                    Spacer(Modifier.height(12.dp))
                    DashboardEmptyState(
                        title = "Aucune vente",
                        description = "Vos ventes récentes apparaîtront ici.",
                        text = text,
                        secondary = secondary,
                        background = background
                    )
                }

                Spacer(Modifier.height(12.dp))

                // Stock.
                DashboardPanel(background, border) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "INVENTAIRE",
                                color = primary,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = 1.1.sp
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "Stock",
                                color = text,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Text(
                            "Gérer",
                            color = primary,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.clickable(onClick = onOpenProducts)
                        )
                    }

                    Spacer(Modifier.height(14.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        StockStat("Produits", "0", primary, background, Modifier.weight(1f))
                        StockStat("Stock faible", "0", warning, background, Modifier.weight(1f))
                        StockStat("Ruptures", "0", error, background, Modifier.weight(1f))
                    }

                    Spacer(Modifier.height(12.dp))
                    Text(
                        "Aucun produit à surveiller.",
                        color = secondary,
                        fontSize = 11.sp,
                        modifier = Modifier.align(Alignment.CenterHorizontally)
                    )
                }

                Spacer(Modifier.height(12.dp))

                // Clients, créances et alertes.
                DashboardMiniPanel(
                    eyebrow = "CLIENTS",
                    title = "Clients actifs",
                    value = "0",
                    description = "client enregistré",
                    link = "Gérer les clients",
                    primary = primary,
                    surface = surface,
                    text = text,
                    secondary = secondary,
                    border = border,
                    onClick = {
                        infoDialog = "Le module Clients sera migré après validation du tableau de bord."
                    }
                )

                Spacer(Modifier.height(9.dp))

                DashboardMiniPanel(
                    eyebrow = "CRÉANCES",
                    title = "À encaisser",
                    value = "—",
                    description = "FCFA",
                    link = "Voir les crédits",
                    primary = primary,
                    surface = surface,
                    text = text,
                    secondary = secondary,
                    border = border,
                    onClick = {
                        infoDialog = "Le suivi des crédits sera migré lors d'une prochaine étape."
                    }
                )

                Spacer(Modifier.height(9.dp))

                DashboardMiniPanel(
                    eyebrow = "ATTENTION",
                    title = "Alertes",
                    value = "0",
                    description = "aucune alerte",
                    link = "Voir les alertes",
                    primary = primary,
                    surface = surface,
                    text = text,
                    secondary = secondary,
                    border = border,
                    onClick = {
                        infoDialog = "Les alertes seront raccordées aux données de stock."
                    }
                )

                Spacer(Modifier.height(12.dp))

                // Journal d'activité.
                DashboardPanel(background, border) {
                    Text(
                        "JOURNAL",
                        color = primary,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 1.1.sp
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Activité récente",
                        color = text,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.height(14.dp))
                    DashboardEmptyState(
                        title = "Aucune activité enregistrée",
                        description = "Les ventes, mouvements de caisse, nouveaux clients et mouvements de stock apparaîtront ici.",
                        text = text,
                        secondary = secondary,
                        background = background
                    )
                }
            }
        }

        // Navigation flottante du site, adaptée au format Android.
        Surface(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(start = 14.dp, end = 14.dp, bottom = 12.dp),
            shape = RoundedCornerShape(22.dp),
            color = surface,
            border = androidx.compose.foundation.BorderStroke(1.dp, border),
            shadowElevation = 8.dp
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(68.dp)
                    .padding(horizontal = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                BottomDashboardItem(
                    label = "Accueil",
                    active = true,
                    icon = { Icon(Icons.Default.Home, null) },
                    primary = primary,
                    secondary = secondary,
                    onClick = {}
                )
                BottomDashboardItem(
                    label = "Ventes",
                    active = false,
                    icon = { Icon(Icons.Default.Receipt, null) },
                    primary = primary,
                    secondary = secondary,
                    onClick = {
                        infoDialog = "Le module Ventes sera migré après validation du tableau de bord."
                    }
                )

                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = primary,
                    modifier = Modifier
                        .size(52.dp)
                        .clickable {
                            infoDialog = "Les actions rapides seront activées au fil de la migration des modules."
                        }
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Default.Add,
                            contentDescription = "Action rapide",
                            tint = Color.White,
                            modifier = Modifier.size(26.dp)
                        )
                    }
                }

                BottomDashboardItem(
                    label = "Produits",
                    active = false,
                    icon = { Icon(Icons.Default.Inventory2, null) },
                    primary = primary,
                    secondary = secondary,
                    onClick = onOpenProducts
                )
                BottomDashboardItem(
                    label = "Plus",
                    active = false,
                    icon = { Icon(Icons.Default.MoreHoriz, null) },
                    primary = primary,
                    secondary = secondary,
                    onClick = {
                        infoDialog = "Le menu Plus sera ajouté lors de la migration de la navigation."
                    }
                )
            }
        }
    }

    if (infoDialog != null) {
        AlertDialog(
            onDismissRequest = { infoDialog = null },
            title = { Text("EJDEN") },
            text = { Text(infoDialog.orEmpty()) },
            confirmButton = {
                TextButton(onClick = { infoDialog = null }) {
                    Text("Compris")
                }
            },
            containerColor = surface,
            titleContentColor = text,
            textContentColor = secondary
        )
    }
}

@Composable
private fun OutlinedDashboardAction(
    label: String,
    icon: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier
            .height(42.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(9.dp),
        color = Color.White,
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            Color(0xFFE2E8EA)
        )
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            CompositionLocalProvider(
                androidx.compose.material3.LocalContentColor provides Color(0xFF68777D)
            ) {
                icon()
            }
            Spacer(Modifier.size(6.dp))
            Text(
                label,
                color = Color(0xFF68777D),
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}

@Composable
private fun DashboardKpi(
    label: String,
    value: String,
    unit: String,
    period: String,
    primary: Color,
    surface: Color,
    text: Color,
    secondary: Color,
    border: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(13.dp),
        colors = CardDefaults.cardColors(containerColor = surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, border),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            Text(
                label,
                color = secondary,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                minLines = 1,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(5.dp))
            Text(
                period,
                color = secondary.copy(alpha = 0.85f),
                fontSize = 9.sp
            )
            Spacer(Modifier.height(12.dp))
            Text(
                value,
                color = text,
                fontSize = 22.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1
            )
            Spacer(Modifier.height(4.dp))
            Text(unit, color = secondary, fontSize = 10.sp)
        }
    }
}

@Composable
private fun DashboardPanel(
    background: Color,
    border: Color,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = background),
        border = androidx.compose.foundation.BorderStroke(1.dp, border),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(15.dp),
            content = content
        )
    }
}

@Composable
private fun DashboardEmptyState(
    title: String,
    description: String,
    text: Color,
    secondary: Color,
    background: Color
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(background, RoundedCornerShape(10.dp))
            .padding(horizontal = 12.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            title,
            color = text,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(5.dp))
        Text(
            description,
            color = secondary,
            fontSize = 10.sp,
            lineHeight = 15.sp,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun StockStat(
    label: String,
    value: String,
    valueColor: Color,
    background: Color,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .background(background, RoundedCornerShape(9.dp))
            .padding(horizontal = 5.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            label,
            color = Color(0xFF68777D),
            fontSize = 9.sp,
            textAlign = TextAlign.Center,
            minLines = 2
        )
        Spacer(Modifier.height(5.dp))
        Text(
            value,
            color = valueColor,
            fontSize = 22.sp,
            fontWeight = FontWeight.ExtraBold
        )
    }
}

@Composable
private fun DashboardMiniPanel(
    eyebrow: String,
    title: String,
    value: String,
    description: String,
    link: String,
    primary: Color,
    surface: Color,
    text: Color,
    secondary: Color,
    border: Color,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, border),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(15.dp)) {
            Text(
                eyebrow,
                color = primary,
                fontSize = 9.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 1.1.sp
            )
            Spacer(Modifier.height(5.dp))
            Text(
                title,
                color = text,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(7.dp))
            Text(
                value,
                color = text,
                fontSize = 26.sp,
                fontWeight = FontWeight.ExtraBold
            )
            Text(description, color = secondary, fontSize = 10.sp)
            Spacer(Modifier.height(10.dp))
            Text(
                link,
                color = primary,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable(onClick = onClick)
            )
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.BottomDashboardItem(
    label: String,
    active: Boolean,
    icon: @Composable () -> Unit,
    primary: Color,
    secondary: Color,
    onClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .weight(1f)
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        CompositionLocalProvider(
            androidx.compose.material3.LocalContentColor provides
                if (active) primary else secondary
        ) {
            Box(Modifier.size(22.dp), contentAlignment = Alignment.Center) {
                icon()
            }
        }
        Spacer(Modifier.height(3.dp))
        Text(
            label,
            color = if (active) primary else secondary,
            fontSize = 9.sp,
            fontWeight = if (active) FontWeight.Bold else FontWeight.Medium
        )
    }
}
