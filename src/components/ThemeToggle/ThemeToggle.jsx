import { useTheme } from '../../context/ThemeContext.jsx';
import Icon from '../Icons/Icons.jsx';
import styles from './ThemeToggle.module.css';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  const label = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';

  return (
    <button type="button" className={styles.toggle} onClick={toggleTheme} title={label} aria-label={label}>
      <Icon name={dark ? 'sun' : 'moon'} size={14} />
    </button>
  );
}
