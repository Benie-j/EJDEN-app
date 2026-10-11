package com.ejden.app

import android.os.Bundle
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
import androidx.compose.foundation.background
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
            var darkMode by remember { mutableStateOf(true) }

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

    LaunchedEffect(Unit) {
        delay(5000)
        showSplash = false
    }

    when {
        showSplash -> SplashScreen()
        showDashboard -> DashboardScreen(
            darkMode = darkMode,
            onThemeChange = onThemeChange
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

            Text(
                text = "Commencez à enregistrer vos produits, vos ventes et vos clients.",
                fontSize = 15.sp,
                lineHeight = 25.sp,
                color = Color(0xFF68777D),
                textAlign = TextAlign.Center,
                modifier = Modifier.widthIn(max = 330.dp)
            )
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

        Spacer(modifier = Modifier.height(18.dp))

        Text(
            text = "Gestion simple • Espace professionnel",
            color = Color(0xFF68777D),
            fontSize = 12.sp,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun DashboardScreen(
    darkMode: Boolean,
    onThemeChange: (Boolean) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "EJDEN",
                    fontSize = 27.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = EjdenBlue
                )
                Text(
                    text = "Tableau de bord",
                    color = MaterialTheme.colorScheme.onBackground
                )
            }

            Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = CircleShape
            ) {
                Icon(
                    imageVector = Icons.Default.Settings,
                    contentDescription = "Paramètres",
                    modifier = Modifier.padding(12.dp),
                    tint = MaterialTheme.colorScheme.onSurface
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "Bienvenue sur EJDEN",
            fontSize = 23.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "La base native est en place. Les modules métier seront migrés progressivement.",
            color = EjdenSecondaryText,
            lineHeight = 22.sp
        )

        Spacer(modifier = Modifier.height(22.dp))

        ModuleCard(
            title = "Produits et stock",
            description = "Catalogue, quantités et mouvements de stock",
            icon = { Icon(Icons.Default.Inventory2, null) }
        )

        ModuleCard(
            title = "Ventes et caisse",
            description = "Ventes, paiements et suivi de caisse",
            icon = { Icon(Icons.Default.PointOfSale, null) }
        )

        ModuleCard(
            title = "Clients",
            description = "Fichier clients et suivi des crédits",
            icon = { Icon(Icons.Default.People, null) }
        )

        ModuleCard(
            title = "Rapports et statistiques",
            description = "Indicateurs et résultats de l'activité",
            icon = { Icon(Icons.Default.Assessment, null) }
        )

        Spacer(modifier = Modifier.height(18.dp))

        Button(
            onClick = { onThemeChange(!darkMode) },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = EjdenBlue
            )
        ) {
            Text(
                if (darkMode) "Activer le thème clair"
                else "Activer le thème sombre"
            )
        }

        Spacer(modifier = Modifier.height(18.dp))

        Text(
            text = "Version native initiale — modules en cours de migration",
            color = EjdenSecondaryText,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun ModuleCard(
    title: String,
    description: String,
    icon: @Composable () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 12.dp),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                color = EjdenLightBlue,
                shape = RoundedCornerShape(14.dp)
            ) {
                Box(
                    modifier = Modifier.size(48.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CompositionLocalProvider(
                        androidx.compose.material3.LocalContentColor provides EjdenDarkBlue
                    ) {
                        icon()
                    }
                }
            }

            Spacer(modifier = Modifier.size(14.dp))

            Column {
                Text(
                    text = title,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = description,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                    color = EjdenSecondaryText
                )
            }
        }
    }
}
