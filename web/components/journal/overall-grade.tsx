export function OverallGrade({ value }: { value: string }) {
  return (
    <>
      {value[0]}
      {value.endsWith("+") && <sup className="overall-grade-plus">+</sup>}
    </>
  )
}
